# 会话栅栏统一 + 深度性能整理 handoff

- 日期 / agent：2026-08-26 / claude (fable)
- 目标：修复"打开新的 workspace 后右边栏浏览器状态没有重置"，消除三个 dock 视图各自手写的会话重置逻辑，并处理由此产生的性能积累问题。

## 根因

三个 dock 视图对"会话切换"的处理各不相同（正是用户禁止的多处冗余）：

- **Files**：view 里手写 first-render-skip ref + `onResetTabs()`（唯一正确的）。
- **Terminal**：pane 的 effect 依赖 sessionId 会重连新会话 PTY，但 tab ledger 不清（半栅栏）——每次切会话，所有保活 xterm 都重连一遍。
- **Browser**：完全无栅栏。模块级 `browserResources` Map + tab ledger 都跨会话存活 → 旧 workspace 的网页永远留在新 workspace 的浏览器里（本次 bug），且 Electron 下每个残留 webview 是一个真实 OS 进程，越切越卡。

## 方案：一处栅栏，三种清理

```
dsh.sessions.list (current 变化)
        │  App.tsx apply() 里的 'deepbuddy: session fence' effect（唯一订阅点）
        ▼
layout.fenceTabs()  ──  一次 patch：tabs 全清 + fence 代数 +1
        │
        ├─ InspectorColumn 用 key={`${view.id}:${fence}`} 重挂所有 view
        │    → 组件本地状态（initialized ref、xterm、webview）随旧会话一起死
        └─ 每个 Definition 的 onSessionFence?.()
             → browser: 清 browserResources + counter 归 1
             → terminal: counter 归 1
```

- `layout-store.ts`：`clearTabs(pane)` 删除，换成 `fenceTabs()`；`LayoutState` 新增 `fence: number`（纯 remount token，store 依旧不知道 session）。
- `catalog.ts`：`InspectorViewProps` 删掉 `onResetTabs`；`InspectorViewTypeDefinition` 新增可选 `onSessionFence`。
- FilesView 的手写栅栏、TerminalView 的 `initializedSession`/`terminalCounters` per-session Map 全部删除。
- 栅栏放 App.tsx（assembly）而非 shell/adapter：它同时需要 session wire 和 catalog，且 layout-store 保持"店里没有 session"原则。

## 已验证

- `pnpm typecheck` 通过；`pnpm test` 64/64（fenceTabs 测试改为：全清 + fence+1 + 单次通知）。
- 3082 真机（web profile）：会话 A 开 dock → browser 打开 example.com → 切到 film-studio 会话 → browser 变成全新 `browser-1`、地址栏空、无 iframe；文件树同步切换。
- 性能 trace（chrome-devtools）：交互 INP 89ms（good 档）；唯一 forced reflow 是官方 ui-conversation 的 `toBottom`（32ms，不可触碰）。DeepBuddy 自有路径无长任务。
- 结构性收益：切会话不再触发 N 个 xterm 重连风暴；旧 workspace 的 webview/iframe 随栅栏销毁，不再跨会话积累（Electron 下每个是独立进程，这是"越用越卡"的来源）。
- dmg 重打包：`apps/desktop/dist/DeepBuddy-0.1.0-arm64.dmg`（157M），asar 内 client.js 已含 fenceTabs/onSessionFence。

## 关键决策与约束

- 切走的会话其 PTY 仍由 host 保留，到 `session/disposed` 才 kill（host.js:809）——上限 3/会话，多客户端场景不能由单个客户端杀；与栅栏前行为一致，非回归。
- keep-alive 规则现在只有一个例外：view body 跨 tab 切换与 dock 开关存活，跨会话必死（remount）。
- 官方 `toBottom` reflow 与 conversation 列内部渲染不属于我们的地盘，未动。

## 复测入口

```bash
cd /Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy
pnpm typecheck && pnpm test && pnpm build
# 真机：DSH_HOME=~/.deepbuddy node_modules/.bin/dsh --profile deepbuddy --port 3082 --no-open
# 路径：开会话 → dock 浏览器开任意网页 → 切另一 workspace 会话 → 浏览器应为全新空标签
```
