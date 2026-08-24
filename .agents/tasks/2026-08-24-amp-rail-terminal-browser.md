# 任务：右栏贴合 AMP —— 去掉概览，新增 终端 + 浏览器 两个 dock 视图

- 日期 / 发起：2026-08-24 / claude（验收方），执行方 codex
- repo：`/Users/byron/Desktop/Projects/Devs/deepbuddy`（pnpm workspace）
- 插件本体：`plugins/deepbuddy`（唯一可改的核心；`apps/desktop` 可按需小改）

## 硬约束（违反即返工）

1. **零 fork**：官方 `@deepseek-ai/*` 包全部锁定 0.1.1-rc.2，不 patch、不改 node_modules、不升级版本。
2. **bundle purity**（build.mjs 强制）：client 侧不得对 `@deepseek-ai/*` 做 value import，除非在 build.mjs 的 PLATFORM_MODULES 白名单里；官方包的 type-only import 允许（先例：`import type {} from '@deepseek-ai/dsh-client-ui-deliverables/client'`）。
3. **不碰 `~/.dsh`**；本地测试一律 `DSH_HOME=~/.deepbuddy`。
4. **不要 commit / 不要动 `.git`**（你的沙箱写不了 .git；验收方负责提交）。
5. 外科手术式修改：不顺手重构、不重命名无关代码；注释密度与风格贴现有文件。
6. 不留向后兼容垫片：删 概览 就删干净（feature 目录、catalog 引用、测试断言、只为它服务的 adapter helper——注意 `textOfParts` 若无其他使用者则一并删；`basename` 仍被 FilesView 用，保留）。

## 现有架构（先读这些文件再动手）

- `plugins/deepbuddy/src/client/app/catalog.ts` — dock 视图注册表 `INSPECTOR_VIEW_TYPES`（数组序 = 分段序，首个为默认）；`InspectorViewProps`（viewId/tabs/active/onOpenTab...）。
- `plugins/deepbuddy/src/client/features/files/` — 现有 dock 视图的完整先例（Definition + Component + host 端点调用方式）。
- `plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx` — 三栏骨架；dock 分段控件、全屏 overlay（dockMax）、TrafficLights 都在这里。
- `plugins/deepbuddy/src/client/shell/layout-store.ts` — 布局状态（dock 开关/宽度/dockMax/tab 台账 openTab/closeTab）。
- `plugins/deepbuddy/src/host.js` — host 半边先例：通过 `ctx.typert` Typert Gateway 注册 `deepbuddyFiles/*` Remote 端点；`inject = ['typert', 'sessions', 'webServer']`——**`webServer` 已注入**（`@deepseek-ai/dsh-host-webserver`，读它的 d.ts 看怎么挂路由/upgrade）。
- `plugins/deepbuddy/build.mjs` — host 半边打包为 Node ESM，client 半边打包为 CJS factory bundle。
- `plugins/deepbuddy/tests/plugin.test.mjs` — 结构断言测试（catalog 内容、drag-region 数量等），改动后同步更新。
- `apps/desktop/main.js` — Electron 壳（BrowserWindow 配置、trafficLightPosition）。
- `plugins/deepbuddy/src/client/ui/` — tokens/kit/icons；新图标加进 `icons.tsx` 的 ICONS 表，风格贴现有手绘 SVG。
- 官方类型参考：`node_modules/@deepseek-ai/dsh-terminal/lib/types/`（注意：这是 **agent 专属** PTY 服务，owner 必须是 Agent，**不能**用于用户终端——所以才要自己做 host 端）。

## 任务 A：删除 概览 视图

- 删 `src/client/features/overview/`（两个文件）。
- `catalog.ts`：`INSPECTOR_VIEW_TYPES` 移除 OverviewViewDefinition；文件视图回到首位（暂时的默认，任务 D 定最终顺序）。
- `package.json`：`@deepseek-ai/dsh-client-ui-deliverables` devDependency 只为概览的类型合并而加，删掉。
- `icons.tsx`：`outline` 图标若无人用则删。
- 测试断言同步。

## 任务 B：终端 视图（完整交互 shell）

用户已确认形态：**真实 PTY 交互终端**，贴 AMP 的 Terminal。

- **前端**：xterm.js（`@xterm/xterm` + `@xterm/addon-fit`）作为 client 依赖（会被 esbuild 内联进 bundle，CSS 也要想办法内联或手工注入——参考 build.mjs 现有的资源处理）。新 feature 目录 `src/client/features/terminal/`，照 files 视图先例出 Definition（id `terminal`，title `终端`，新图标 `terminal`）。
- **host 端**：`node-pty` 起 shell（用户默认 shell，fallback zsh），cwd = 会话工作区根（复用 host.js 里 `resolveSessionCwd` 的做法）。通过注入的 `webServer` 挂 WebSocket（若其 API 不支持 upgrade，读 d.ts 找替代：SSE 下行 + Remote 端点上行也可接受，但优先 WS）。协议自定：输入、输出、resize（cols/rows）、退出码。
- **生命周期**：每个 dsh 会话至多一个终端实例（v1 单实例，不做多 tab）；关闭 dock/切走视图**不杀** shell（保持后台）；显式关闭或 dsh 会话结束时销毁；前端重连（组件重挂载）能接回既有 scrollback（host 端保留有限回滚缓冲，如 64KB）。
- **安全**：终端 spawn 必须校验请求携带的 sessionId 真实存在（同 host.js 的 session fence 思路）；不能让任意 ws 连接拿到 shell。
- **desktop 注意**：`node-pty` 是 native 模块。dsh server 在 desktop 里作为 Node 子进程运行（看 `apps/desktop/main.js` 确认），electron-builder 打包时 native 依赖需要正确 unpack（asarUnpack）。装依赖装到 `plugins/deepbuddy`，验证 `cd apps/desktop && pnpm build` 仍成功。
- **主题**：xterm 配色接 DeepBuddy 的 CSS 变量（背景 `--db-window`、前景文字色），字体用全局字体栈（Departure Mono 已是全局 mono 偏好）。

## 任务 C：浏览器 视图（通用浏览器）

用户已确认形态：**通用浏览器**，desktop 完整、web 降级。

- 新 feature `src/client/features/browser/`，Definition（id `browser`，title `浏览器`，新图标 `globe`）。
- **工具条**：后退 / 前进 / 刷新 / 地址栏（回车导航，无 scheme 自动补 `https://`；`localhost:3000` 这类补 `http://`）/ 在系统浏览器打开。
- **desktop（Electron）**：用 `<webview>` 标签加载任意站点。需要 `apps/desktop/main.js` 的 BrowserWindow `webPreferences.webviewTag: true`。后退/前进/刷新走 webview API；地址栏跟随 `did-navigate` 事件同步。
- **web 版**：iframe 加载；检测加载失败/被 X-Frame-Options 拒绝时显示提示（"该站点拒绝嵌入"）+ 在系统浏览器打开按钮（`window.open`）。前进/后退在 iframe 上不可靠，禁用即可（灰态）。
- 运行时判别用现有的 `IN_ELECTRON` 常量（在 shell/ 或 ui/ 里 grep）。
- 初始状态：空地址栏 + 居中占位（输入地址开始浏览）。

## 任务 D：dock 分段贴 AMP

- 分段 tab 改为 **图标 + 文字**（AMP：Changes/Portal/Files/Terminal 风格）：`文件`、`终端`、`浏览器`，顺序即此，`文件` 为默认。
- 保持现有：分段在顶栏 52px 行、全屏（dockMax）按钮、关闭按钮。不动左/中栏。

## 验收门禁（自测后在 handoff 里附实际输出）

```bash
cd /Users/byron/Desktop/Projects/Devs/deepbuddy
pnpm build && pnpm typecheck && pnpm test   # 必须全绿；新增功能补测试（结构断言级即可）
cd apps/desktop && pnpm build               # electron-builder 打包必须成功
```

浏览器级验证（终端能敲命令、浏览器能导航）由验收方做，你不必起 dev server；但如果你要自测，用 `DSH_HOME=~/.deepbuddy` 起在 **3086 以外** 的端口，不要动 3086 的现役实例。

## 交付

完成后写 handoff：`.agents/handoffs/2026-08-24-amp-rail.md`（模板见 `.agents/` 现有文件）：改动文件清单、协议/依赖决策及理由、门禁实际输出、已知限制。**不要 commit。**
