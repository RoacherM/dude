# 任务：dock 视图 keep-alive（修 bug）+ 终端/浏览器多实例 tabs

- 日期 / 发起：2026-08-24 / claude（验收方），执行方 codex（续上一任务上下文）
- 前置：上一波已提交 `b4a5662`（AMP rail：文件/终端/浏览器）。硬约束与上一份任务书完全相同
  （零 fork、bundle purity、不 commit、外科手术式修改、门禁同款）。

## Bug 1（用户实测报告）：切换分段后浏览器页面消失

复现：dock 浏览器加载一个页面 → 切到 文件 或 终端 → 切回 浏览器 → 页面没了
（用户截图显示切回后出现「该站点拒绝嵌入」误报）。

根因方向：InspectorColumn 按 active 分段条件渲染，切换即卸载组件——webview/iframe
DOM 销毁；重挂载时 URL/历史丢失，且残留的失败状态误显示拒绝提示。

**修复要求：dock 三个视图全部 keep-alive。**

- InspectorColumn 同时挂载所有 `INSPECTOR_VIEW_TYPES` 组件，非 active 的用
  `display: none`（或等效）隐藏，**不卸载**。切换分段 = 纯显隐。
- 这同时消除终端切换时的 WS 断开重连（现在切走会 detach）。注意隐藏期间
  xterm 的 FitAddon 在重新显示时要重新 fit 一次（display:none 下尺寸为 0）。
- webview/iframe 在隐藏期间保持存活，切回即原样。
- 「该站点拒绝嵌入」提示只允许由**当次真实加载失败事件**触发：导航开始时清空
  错误状态；组件重挂载（如 dock 重开）不得沿用上一次的失败标记。
- dock 关闭（`dock: false`）仍卸载整列——可接受；但浏览器每个 tab 的 URL 状态
  必须存活在 React 组件之外（layout store 或模块级 store），dock 重开后恢复地址
  并重新导航；终端本来就有 host 端 scrollback 重放，不用改。

## 需求 2：终端 / 浏览器多实例 tabs

用户原话：「可以打开多个terminal/browser么？」——要支持。

- **复用现有台账**：`InspectorViewProps` 已有 `tabs/active/onOpenTab/onCloseTab/
  onFocusTab`（layout-store 的 TabRef 机制，files 视图是先例）。终端和浏览器
  接上同一机制，不发明新状态层。
- **UI**：视图内顶部一条 tab 条（贴现有 files tab 条样式）：每个 tab 显示标签 +
  关闭 ×，末尾一个「+」新建。单 tab 时也显示 tab 条（保持稳定布局）。
- **终端多实例**：
  - host 协议与 manager 改为 `sessionId + termId` 复合键（termId 由 client 生成，
    如 `term-1` 递增；WS query 加 `termId`）。每 session 并发 PTY 上限 6，超限
    host 返回 error 消息，前端提示。
  - tab 标签：`终端 1` / `终端 2` …；关闭 tab = kill 对应 PTY + 关 WS。
  - keep-alive 语义不变：切 tab / 切分段不 kill，只有点 × 或会话销毁才清理。
  - 兼容清理：旧的单实例键彻底删掉，不留 fallback 路径。
- **浏览器多实例**：
  - 每个 tab 独立 URL / 历史 /（desktop）webview 实例；tab 间同样 keep-alive
    （隐藏不卸载）。
  - tab 标签：显示页面 title（desktop `page-title-updated`；web iframe 拿不到就
    显示主机名），空 tab 显示 `新标签页`。
  - 「+」新建空 tab（空地址栏 + 占位）。
- 多 tab 的隐藏策略沿用 Bug 1 的 display:none 方案（同一实现，别做两套）。

## 测试与门禁

- `tests/plugin.test.mjs` 更新/新增结构断言：keep-alive（所有视图常驻渲染 +
  display 切换）、termId 协议、tab 条、上限 6。
- 门禁同前：`pnpm build && pnpm typecheck && pnpm test`，`cd apps/desktop && pnpm build`
  全绿；实际输出写进 handoff。

## 交付

handoff 写到 `.agents/handoffs/2026-08-24-dock-keepalive-multitab.md`，
含改动清单、协议变更、门禁输出、已知限制。**不要 commit。**
