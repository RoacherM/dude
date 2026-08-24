# Dock keep-alive 与终端/浏览器多实例 handoff

- 日期 / agent：2026-08-24 / codex
- 目标：修复 dock 分段切换卸载浏览器/终端的问题，并让 Terminal、Browser 复用 layout-store tab 台账支持多实例。

## 已完成

- `plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx`
  - `InspectorColumn` 现在遍历并同时挂载全部 `INSPECTOR_VIEW_TYPES`。
  - 非当前 view 只切换 `display: none`，分段切换不再卸载 webview、iframe 或 xterm/WS。
  - Shell 只传 `visible` 和各 view 的 tab 台账，不含 feature id 业务分支。
- `plugins/deepbuddy/src/client/ui/InspectorTabs.tsx`
  - 新增 Files / Terminal / Browser 共用的 38px tab 条；tab 有标签和关闭按钮，资源视图可提供末尾 `+`。
- `plugins/deepbuddy/src/client/app/catalog.ts`、`plugins/deepbuddy/src/client/shell/layout-store.ts`
  - `InspectorViewProps` 增加纯显隐事实 `visible`。
  - `openTab` 可更新已有 tab 标签且不抢焦点；Files 显式调用 `onFocusTab` 保持原点击行为。
- `plugins/deepbuddy/src/client/features/files/FilesView.tsx`
  - 文件视图改用共享 tab 条，文件树、预览与原有 session tab 清理语义不变。
- `plugins/deepbuddy/src/client/features/terminal/TerminalView.tsx`
  - 每个 tab 挂载独立 `TerminalPane`，非 active tab 使用同一 `display: none` keep-alive 方式。
  - client 生成递增 `term-1`、`term-2`…，标签为 `终端 1`、`终端 2`…。
  - 切 tab / 切 dock 分段不会断 WS；隐藏 pane 再显示时显式调用 FitAddon `fit()` 并发送 resize。
  - 点击 tab `×` 会先给对应 WS 发 `kill` 再关闭连接和移除 tab；连接尚在 CONNECTING 时等待 open 后执行，dock 整列卸载只 detach、不 kill。
- `plugins/deepbuddy/src/host.js`
  - 终端资源键从单一 `sessionId` 改为 `sessionId + termId` 复合键，无旧键 fallback。
  - WS URL：`/deepbuddy/terminal?sessionId=<session>&termId=term-N`；缺失/非法 `termId` 返回 `term-id-required`。
  - 每个 session 最多 6 个并发 PTY；超限返回 `terminal-limit-reached: max 6 per session`。
  - `session/disposed` 会 dispose 该 session 的所有 PTY 和客户端；单 tab kill 只影响对应 termId。
- `plugins/deepbuddy/src/client/features/browser/BrowserView.tsx`
  - 每个 tab 有独立地址、历史和 webview/iframe DOM，inactive tab 只 `display: none`。
  - URL/地址栏写入模块级 `browserResources`，dock 关闭重开后恢复 URL 并重新导航；失败状态不持久化。
  - desktop 用 `page-title-updated` 更新 tab 标题；web iframe 用 hostname；空 tab 为 `新标签页`。
  - `will-navigate` / `did-start-loading` 清空错误；只有当前主 frame 的 `did-fail-load`（忽略 aborted）或 iframe `onError` 才显示「该站点拒绝嵌入」。已删除通过 `about:blank` 猜测拒绝的逻辑。
- `plugins/deepbuddy/tests/plugin.test.mjs`
  - 新增/更新结构断言：全部 view 常驻映射、view/tab 的 `display` keep-alive、xterm 重新 fit、共享 tab 条、`termId` query、复合键、页面 title 事件和每 session 上限 6。

## 协议实测

隔离服务通过 `./scripts/deepbuddy --port 3092 --no-open` 启动，使用 `~/.deepbuddy` 的一个已存在 session 建立 7 条不同 termId 的真实 WebSocket：

```text
term-101 snapshot:running
term-102 snapshot:running
term-103 snapshot:running
term-104 snapshot:running
term-105 error:terminal-limit-reached: max 6 per session
term-106 snapshot:running
term-107 snapshot:running
```

并发到达顺序不保证哪个 termId 成为第 7 个；结果为 6 个 running、1 个 limit error。结束时向 6 个已连接实例逐个发送 `kill` 并关闭 WS；服务已停止，3092 无监听。

## 门禁

根目录执行：

```sh
pnpm build && pnpm typecheck && pnpm test
```

实际结果：exit 0；两个 plugin 均 build/typecheck 通过；`dsh-plugin-deepbuddy` 58/58，`dsh-plugin-terminal-probe` 5/5。

Desktop 执行：

```sh
cd apps/desktop && pnpm build
```

实际结果：exit 0；stage runtime 完成（含 `node-pty 1.2.0-beta.15`、`ws 8.21.3`），Electron arm64 app 与 `dist/DeepBuddy-0.1.0-arm64.dmg` / blockmap 构建成功。存在既有的 React peer warning、缺少签名证书 warning，不影响 build exit 0。

## 未完成与已知限制

- 可视 UI 点击路径未验证：已按项目 Browser 验收流程尝试连接 `http://127.0.0.1:3092/`，当前运行时返回 `No browser is available`，浏览器列表为空；没有用构建结果冒充可视端到端结论。
- 普通 web 模式的跨域 iframe 无法读取 page title，按任务书显示 hostname；某些站点的 X-Frame/CSP 拒绝不会触发 iframe `onError`，此时保留浏览器原生阻止页面，不做 `about:blank` 猜测和误报。
- dock 整列关闭按任务书允许卸载：Browser 恢复 URL 并重新导航，但关闭前的 DOM history 不跨 dock 重开；分段和 tab 切换期间 history 完整保留。

## 关键约束

- 零 fork、零子代理、未 commit。
- 未修改官方包，未升级依赖，未写入 `~/.dsh`；开发/实测只使用 `~/.deepbuddy`。
- 用户提供的任务书 `.agents/tasks/2026-08-24-dock-keepalive-multitab.md` 保持未跟踪、未修改。

## 复测入口

```sh
pnpm build && pnpm typecheck && pnpm test
(cd apps/desktop && pnpm build)

./scripts/deepbuddy --port 3092 --no-open
DSH_WEB_URL=http://127.0.0.1:3092 pnpm --filter deepbuddy-desktop start
```

可视复测：进入已开始的 session → 浏览器打开页面 → 切文件/终端再切回 → 页面应保持；连续新建浏览器/终端 tab 并互切；终端第 7 个应显示 host 上限错误；关闭单个终端 tab 后其余实例应继续运行；关闭并重开 dock 后浏览器应恢复每个 tab 的地址并重新导航。
