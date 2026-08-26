# 已加载网页拖拽的起手首帧仍有卡顿
- 日期 / agent：2026-08-24 / codex
- 我原来的理解：冻结 guest viewport 后，整个拖拽手势都会流畅。
- 用户实际要的：冻结后持续拖动已改善，但刚开始拖动的第一下仍不丝滑。
- 分歧根源：环境假设；冻结逻辑在 mousedown 才创建全屏 compositor layer 并同步测量 webview，工作从连续帧移到了首帧但没有消失。
- 以后如何避免：高频手势的辅助层必须在 mount 时预建；昂贵元素的几何数据由 ResizeObserver 提前缓存，pointerdown 不做 DOM 创建或强制布局读取。
