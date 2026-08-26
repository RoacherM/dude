# Desktop 侧修复不能只用 web iframe 路径验收

- 日期 / agent：2026-08-24 / claude
- 我原来的理解：在 web 版（Chrome + iframe）验证 shield/freeze/thaw 机制 + 门禁
  绿 + desktop smoke 截图，即可宣布拖拽卡顿已修复。
- 用户实际要的：desktop（Electron `<webview>`）里的真实手势不卡、不出坏状态；
  web iframe 与 webview 是两条完全不同的输入/渲染路径。
- 分歧根源：环境假设。合成 DOM 事件绕过了 OOPIF hit-testing 与 OS 输入管线，
  测不到「窗口外松手 → mouseup 丢失 → 手势永不终止」这类真实缺陷。
- 以后如何避免：涉及 webview/输入手势的 desktop 改动，验收必须用
  `DeepBuddy.app --remote-debugging-port=9333` + CDP `Input.dispatchMouseEvent`
  真机复测（探针脚本模板：/tmp/db-cdp-probe.mjs、/tmp/db-cdp-input.mjs，
  含 press-move-不-release 的 D3 场景）；并且要覆盖「事件丢失」的负路径，
  不只测 happy path。
