# wave4 布局回撤与结构性 UI 调整 handoff

- 日期 / agent：2026-08-22 / claude
- 目标：执行用户实测二轮反馈的五项布局回撤与结构性 UI 调整，逐项浏览器实测。
- git 基线：`31cda4c`。**未 commit**。

## 已完成（五项，全部浏览器实测通过）

基线 `31cda4c`；改动集中在 `plugins/deepbuddy/src/client/` 与 `tests/` 与两份 design 文档。

| # | 需求 | 改动 | 实测证据 |
|---|---|---|---|
| 1 | 撤销"右列关闭占满全宽"，内容列始终居中 | `ui/tokens.ts` 新增 `chatColumnWide: 880`；`conversation/Chat.tsx` `columnStyle()` 改为 `width:'100%' + maxWidth(dockOpen?720:880) + margin:'0 auto'`（Stream/Composer/Hero 全走它） | dock 关：880px 列 left=414.5 居中于主列（268→1440）；dock 开：720 封顶列居中（left 301 / right 745，主列 269→777 两侧余 32） |
| 2 | 侧栏"对话"行去掉 + 号，整行即新建 | `conversation/Chat.tsx` `ChatNav()`：删掉 `trailing` 的 `+ IconButton`，整行 `onClick={newTask}`（`setView(chat)` + `newTask()`），`title="新建任务"` | 无 `button[title=新建任务]`，仅 `div[title=新建任务]` 行（rows=1, plusBtns=0） |
| 3 | 默认工作空间：不选文件夹也能开聊 | `dsh/adapter.ts` 的 `Dsh` 新增 `resolveHome()`（先 `host.listDirectory` 取 `home`，兜底 `host.describe` 的 `cwd`，均 host 提供、不硬编码路径）；`conversation/store.ts` 新增 `homePath` 状态、`resolveHome()`、`defaultWorkspace()`（优先已存在 home-path workspace → recent → first → 没有则 `workspaces.create({path:home})`），`send()` 的 wsId 兜底改为 `armed ?? await defaultWorkspace()`；`Chat.tsx` `currentWorkspace()` 在无真实 workspace 时合成"默认空间"视图（`__default__` 哨兵 id），blank 页 effect 触发 `resolveHome()`，chip title 对默认空间显示实际路径 | 未选工作空间直接发送：hero→stream 切换成功，无 `没有可用的工作空间` / `发送失败` |
| 4 | 停靠栏只在会话内可见 | `layout-store.ts` 的 `LayoutState` 新增 `sessionStarted` + `setSessionStarted()`；`ChatView` 用 `!conversation.isBlank` 贡献；`ThreeColumnFrame` 主列 dock 开关、root 的 dock 渲染都 gate 在 `s.sessionStarted` 上 | blank 页 `dockToggle:false`；发出首条消息（session started）后 `dockToggle:true` |
| 5 | 设置改为弹层面板 | `settings/SettingsApp.tsx`：`SettingsApp` 保留为面板内容，新增 `SettingsDialog`（宿主 `KIT.Dialog`，居中 `min(1200px,90vw)`/`min(860px,90vh)`、圆角、遮罩点击关闭、右上角 ×）；`settings/index.ts` 导出 `SettingsDialog`，删除 `SettingsAppDefinition`（不再是 workbench app）；`app/catalog.ts` `WORKBENCH_APPS` 只剩 Conversation；`ThreeColumnFrame` root 渲染 `{s.settingsOpen && <SettingsDialog/>}`，主列不再分支 settings；`KIT.Dialog` 的 Esc 新增 `openPopoverCount` 守门（§12：先关 Popover 再关 Dialog）；`layout-store` 删除吞 Esc 的分支 | 设置打开为 overlay（`closeBtn:true`），主列继续显示 composer（`mainChat:true`），rail 含 Harness/模式/插件；Esc 关闭；遮罩点击（20,80）关闭 |

## 验证（全绿）

```sh
pnpm build && pnpm typecheck && pnpm test    # deepbuddy 50 条全绿；terminal-probe 5 条全绿
SMOKE_PORT=3090 node scripts/sync-upstream.mjs --smoke   # 4 PASS
```

浏览器实测（puppeteer-core + Chrome headless，端口 3082）：一次性脚本 8 项全 PASS、控制台/pageerror 零错误。
服务器 `dsh --profile deepbuddy --port 3082` 由本会话 hub 进程托管（`dbdy-wave4`），**已停**。

## 关键约束/教训

- **`KIT.Row` 是 `div` 不是 `button`**：wave4 §2 要求"行是 button 语义"。当前 `RowImpl` 渲染 `div`，只接受 `onClick`。为不破坏 KIT 契约，`ChatNav` 用了 `title` + 整行 `onClick`（键盘 Enter/Space 未接 role=button —— 若后续做无障碍强化，需给 `Row` 加 `role`/`tabIndex`/`onKeyDown` 或把新任务入口改成真 button）。
- **默认工作空间 chip 展示范围**：需求要求"空白页 chip 默认显示「默认空间」"。实现为：**没有任何真实 workspace 时**才合成"默认空间"视图。本部署中 auto-select 的 blank 会话已归属某 workspace（如 Docs），此时 chip 如实显示该 workspace（它就是下一条消息真正落点）。真正"零 workspace 首启"场景的 chip 与 send 兜底路径已按 "home 默认" 实现，但本部署有真实 workspace，无法端到端复现零 workspace 首启，逻辑经 code review + send 实测可接受。
- **`host.listDirectory` 依赖 `browse` 能力**：`resolveHome()` 优先 `host.listDirectory({})` 的 `home`；若 browse 未启用会抛错，已 try/catch 兜底到 `host.describe` 的 `cwd`（仍为 host 提供）。desktop 部署 browse 已启用（冒烟 `session.list → deepbuddyFiles/listDirectory` 7 条成功）。
- **编辑器多次误删/重复**：`createDsh`、`layout-store` 的 state 块、`ChatNav` 尾部、`watchSession` 因 SWAP 边界误伤被反复修复（恢复 rosterListeners、createDsh 签名、去重 keydown/state）。最终 `pnpm typecheck` 全绿兜底。
- **DESIGN_INTENT §2/§6、FEATURE_MAP §3/§4/§9** 已同步当前态（geometry 880 居中、settings dialog、dock in-session、default workspace）。

## 复测入口

```sh
node_modules/.bin/dsh --profile deepbuddy --port 3082   # 浏览器 http://127.0.0.1:3082
pnpm --filter dsh-plugin-deepbuddy build && pnpm --filter dsh-plugin-deepbuddy test
SMOKE_PORT=3090 node scripts/sync-upstream.mjs --smoke
```
