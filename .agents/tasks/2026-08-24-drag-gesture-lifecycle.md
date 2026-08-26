# 拖拽手势生命周期重构（pointer capture）＋把手命中区

## 背景与已确认根因（CDP 真机证据，非推测）

用户截图（desktop，baidu 已加载）：dock 很宽但 webview 停在旧宽度，右侧黑带。
我用 CDP `Input.dispatchMouseEvent`（真实输入管线，含 OOPIF hit-testing）在打包
app 里复现：

- D1/D2：press 把手 → 拖过 webview 区域 → 在 webview 区域内 release：一切正常
  （shield 拦截有效、24/24 mousemove 送达、thaw 执行、guest 一次性 resize）。
- **D3：press → moves → 不 release**（等价于在窗口外松手/事件丢失）：
  `{shield:true, dockW:552, wvStyleW:"432px", wvRectW:432, cursor:"col-resize"}`
  —— 与用户截图完全一致。且 window mousemove 监听仍挂着：**不按键移动鼠标
  dock 继续跟随**（用户感知的"卡/乱"），直到任意一次 mouseup 才恢复。
- D3 补发 mouseup 后完全恢复（`shield:false, wvStyleW:"100%"`）：
  freeze/thaw 本身正确，问题只在手势终止不可靠。

根因：`layout-store.ts` `trackDrag` 用 window mousemove/mouseup + blur 兜底。
mouseup 在窗口外释放时不会送达 renderer，blur 也不触发 → 手势永不结束。

## 任务 A（P0）：trackDrag 改为 Pointer Events + setPointerCapture

`plugins/deepbuddy/src/client/shell/layout-store.ts` + `ColumnFrame.tsx` Handle：

- Handle 改 `onPointerDown`；`startSideDrag`/`startDockDrag` 签名随之调整
  （需要 pointerId 与 target）。
- pointerdown 时 `handle.setPointerCapture(e.pointerId)`；pointermove /
  pointerup / pointercancel / lostpointercapture 都监听在把手元素上。
  capture 保证事件路由到把手（含窗口外与 OOPIF 区域），窗口外松手也会收到
  pointerup；pointercancel/lostpointercapture 是保证触发的终止事件。
- 统一一个幂等的 `finish()`：取消 rAF、flush 最后位置、移除监听、恢复
  cursor、执行 done（thaw）。pointerup、pointercancel、lostpointercapture、
  window blur（保留作兜底）全部走它；重复调用无害。
- 保留 rAF 合并（每帧最多一次宽度写入）与 clamp 边界 no-op。
- **删除 shield**：capture 已保证事件路由，freeze 已把 embeds 的
  pointer-events 置 none；shield 及其 dataset 一并删除（不留兼容层）。
  拖拽期间 cursor 用 body.style.cursor 维持即可。
- 双击重置（onDoubleClick）行为不变。

## 任务 B（P0）：把手命中区从 1px 加宽

`ColumnFrame.tsx` Handle 目前 `width:1px` + transparent boxShadow——boxShadow
不参与 hit-testing，实际命中区就是 1px，极难抓且一越界就悬停进 guest。
改为视觉 1px、命中 ~8px：例如外层 8px 宽透明、`margin: 0 -3.5px`、`zIndex`
保持在列之上，内部画 1px 竖线（或 background-clip 方案，任选最简）。
两条 Handle（侧栏/dock）同享。列布局不得因负 margin 位移（视觉回归自查）。

## 任务 C（P1）：freeze 硬化

`freezeDockEmbeds`：跳过测量宽度为 0 的 embed（此前对隐藏 pane 写过
`width:0px`）；thaw 幂等（配合 finish()）。

## 硬约束

- 零 fork；不动官方包；不写 ~/.deepbuddy 之外的配置；不 commit。
- 外科手术式：只碰上述文件与测试；不顺手重构无关代码。
- 不加配置项、不留 shield 兼容分支。
- `plugins/deepbuddy/tests/plugin.test.mjs`：更新/新增结构断言——
  pointer capture 路径（setPointerCapture、pointercancel/lostpointercapture
  终止、finish 幂等）、shield 已删除、把手命中区宽度、freeze 跳过 0 宽。
  删除断言 shield 存在的旧测试。

## 门禁

```sh
pnpm build && pnpm typecheck && pnpm test
(cd apps/desktop && pnpm build)
git diff --check
```

完成后写 handoff 到 `.agents/handoffs/2026-08-24-drag-gesture-lifecycle.md`，
如实标注未验证项（真实手势由验收方用 CDP 真机复测）。
