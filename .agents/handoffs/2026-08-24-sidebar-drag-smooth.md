# 左右边栏拖拽流畅度修复 handoff

- 日期 / agent：2026-08-24 / codex
- 目标：修复右侧 dock 向右缩小时明显卡顿，同时改善左右边栏的高频拖拽写入。

## 已完成

- `plugins/deepbuddy/src/client/shell/layout-store.ts`
  - 拖拽开始后挂载全窗口透明 resize shield，避免指针向右进入 Browser `<webview>/<iframe>` 后宿主窗口丢失 `mousemove`。
  - mousemove 只记录最新位置，通过 `requestAnimationFrame` 每帧最多写一次宽度。
  - 到达 clamp 边界后，相同 `width/flex` 不再重复写入。
  - `mouseup` 或窗口 `blur` 都会取消 frame、移除 listener/shield 并恢复 cursor。
  - 用户用已加载 Baidu 的截图确认空 Browser 正常、真实网页加载后卡顿；拖拽期间现冻结 webview/iframe 的实际 viewport 宽度并裁切 dock，松手后恢复原 inline style，只让 guest page 做一次最终 resize。
  - 用户复测确认持续拖动已改善、但起手首帧仍顿：resize shield 现于 LayoutStore mount 时预建并复用；BrowserPane 用 ResizeObserver 提前缓存 guest viewport 宽度，mousedown 不再创建 overlay 或同步读取 webview layout。
- `plugins/deepbuddy/src/client/features/terminal/TerminalView.tsx`
  - xterm 的 ResizeObserver 改为 80ms trailing fit；右栏缩窄时不再每帧重排 wrapped scrollback 和发送 PTY resize。
  - unmount 时清理 resize timer；Terminal keep-alive / WebSocket 生命周期不变。
- `plugins/deepbuddy/tests/plugin.test.mjs`
  - 新增方向性拖拽回归：webview shield 存在、loaded webview viewport 在手势期间冻结并于 mouseup 恢复、同一帧多次 mousemove 只应用最后位置、30% 边界不重复写、mouseup 后清理。
  - DeepBuddy 测试从 61 条增至 62 条。

## 验证

- `pnpm typecheck`：通过（deepbuddy + terminal-probe）。
- `pnpm test`：通过；deepbuddy `62/62`，terminal-probe `5/5`。
- `pnpm build`：通过。
- `git diff --check`：通过。
- 实际 Electron 手势：未验证；本 session 的 Browser runtime discovery 为 `[]`，没有可连接的 UI 实例。

## 关键决策与约束

- 保留当前右栏 30%–70%、416px floor 的现行几何合同；本次修的是输入事件连续性与拖拽热路径，不擅自改变产品宽度范围。
- 保留 Browser/Terminal keep-alive，多实例 tab 和 PTY 生命周期不变。
- 本次纠偏记录：`.agents/corrections/2026-08-24-browser-drag-reflow.md`。
- 起手首帧纠偏：`.agents/corrections/2026-08-24-browser-drag-start-hitch.md`。
- 零 fork、未 commit；改动叠加在同一未提交性能优化工作区。

## 未完成 & 下一步

- 在实际 Electron 中分别以 Files、Terminal、Browser 为 active view，连续执行“向左拉宽 → 向右缩窄”，确认指针进入 Browser 内容后仍连续跟手，Terminal 停手后一次性 fit。
- 右栏默认宽度本身就是 30% 下限；在默认位置继续向右不会再缩小。如果产品需要更窄范围，应单独修改 `geometry.ts` 与 `DESIGN_INTENT.md`，不与本次流畅度修复混在一起。

## 复测入口

```bash
cd /Users/byron/Desktop/Projects/Devs/deepbuddy
pnpm typecheck
pnpm test
pnpm build
git diff --check
```
