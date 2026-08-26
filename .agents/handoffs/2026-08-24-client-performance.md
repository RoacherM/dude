# 客户端点击性能优化 handoff

- 日期 / agent：2026-08-24 / codex
- 目标：在不破坏 dock keep-alive、终端/浏览器多实例 tabs 的前提下，减少普通点击触发的无关订阅、整棵 Shell 重渲染和隐藏资源工作。

## 已完成

- 删除未被 UI 消费、却持续订阅 session list / workspace list / 当前 conversation stream 的 `plugins/deepbuddy/src/client/features/conversation/store.ts`；侧栏“新建任务”直接调用 `dsh.workspaces.startSession()`。
- `plugins/deepbuddy/src/client/shell/layout-store.ts` 改为 selector 订阅；Root、dock toggle、Inspector 只订阅各自使用的投影。重复 tab label、重复聚焦 active tab、重复清空 tabs 均为 no-op。
- `plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx` 为每个 Inspector view 建立 memoized keep-alive mount 和稳定回调；某一 view 的 tab 变化不再重绘其他 view。
- `plugins/deepbuddy/src/client/features/browser/BrowserView.tsx` 固定 `onLabel`，webview 的 6 个导航监听器不再因父组件重渲染反复解绑/重绑；每个 Browser tab 使用 memoized mount，页面仍通过 `display` 保活。
- `plugins/deepbuddy/src/client/features/terminal/TerminalView.tsx` 只订阅当前 session id；隐藏 xterm 仍保活，但 ResizeObserver 不再执行 `fit()` 或发送 resize。
- `plugins/deepbuddy/src/client/features/files/store.ts` 与 `FilesView.tsx` 改为 Files 可见时才请求根目录；session 切换用一次 `clearTabs()` 清空整个 ledger，不再逐 tab 发布中间状态。
- `plugins/deepbuddy/tests/plugin.test.mjs` 新增性能回归测试。相同 tab label + 连续点击 active tab 的通知序列由修复前 `1 -> 2 -> 3 -> 4` 收敛为首次 open 后保持 `1`；Files 隐藏时根目录请求为 `0`，可见后的重复请求合并为 `1`。

## 验证

- `pnpm typecheck`：通过（deepbuddy + terminal-probe）。
- `pnpm test`：通过；deepbuddy `61/61`，terminal-probe `5/5`。
- `pnpm build`：通过。
- `git diff --check`：通过。
- 实际 UI 点击路径：未验证。Browser runtime discovery 返回 `[]`，当前环境没有可连接的浏览器；未用构建结果代替端到端结论。

## 未完成 & 下一步

- 在可用的 DeepBuddy/Electron 实例中复测：连续切 Files / Terminal / Browser、连续点 active tab、浏览器页面 title 更新、隐藏终端持续输出、切回终端后的 fit，以及 Files 首次可见加载。
- 若要量化帧耗时，在该实例中用 React Profiler/Performance 录制同一套点击路径；当前交付只证明订阅和 store 通知数量收敛，不声称已取得真实帧时间数据。

## 关键决策与约束

- 保留 dock view 和 Browser/Terminal tab 的 `display` keep-alive；没有把资源改回条件挂载。
- Files lazy load 仍由现有 FilesStore/FilesView 承担，不新增 loader、配置项或兼容层。
- 零 fork、未 commit；工作区改动保持未提交。

## 复测入口

```bash
cd /Users/byron/Desktop/Projects/Devs/deepbuddy
pnpm typecheck
pnpm test
pnpm build
git diff --check
```
