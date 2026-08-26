# 右栏拖拽卡顿的关键是已加载 guest page 重排
- 日期 / agent：2026-08-24 / codex
- 我原来的理解：右拖进入 Browser 区域后，主要是 `<webview>/<iframe>` 吞掉宿主 mousemove，以及 xterm 缩窄重排造成卡顿。
- 用户实际要的：未打开网页时拖拽正常，打开网页后才明显卡顿；必须处理已加载网页随 dock 每一帧变化而发生的 guest viewport layout/paint。
- 分歧根源：环境假设；没有实际 Electron UI，只从事件路径推断，低估了 loaded webview 自身 resize 的成本。
- 以后如何避免：Browser 相关 resize 性能问题必须分别验证空页与已加载真实网页；若只有后者复现，先冻结 guest viewport 并在拖拽结束时一次性 resize。
