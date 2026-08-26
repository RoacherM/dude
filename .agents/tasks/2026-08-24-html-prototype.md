# DeepBuddy UI 交互原型（单文件 HTML）

## 目标

把当前 DeepBuddy 的 UI/交互复刻成一个**零依赖、可交互**的设计原型：
`deepbuddy-design-current/prototype/index.html`（单文件，内嵌 CSS/JS，
`file://` 直接打开即可用）。用途：设计迭代的可玩底稿——用户会直接改
CSS 试方案，所以样式全部走 CSS 变量，命名与代码 token 一一对应。

## 参考素材（都在仓库内）

- `.agents/reference/proto-ref/tokens-computed.json`：真实运行时抓取的
  398 个 `--db-*` / `--dsw-*` computed 值。原型 `:root` 直接用这份值，
  **保留原变量名**。
- `.agents/reference/proto-ref/state-*.png`：7 张真实界面状态截图
  （1-hero、2-会话、3-dock 文件、4-dock 终端、5-浏览器多 tab、
  6-dockMax、7-侧栏折叠）。视觉还原以截图为准。
- 源码事实（结构/度量/交互规则的唯一权威）：
  - `plugins/deepbuddy/src/client/ui/tokens.ts`（METRICS、全局样式）
  - `plugins/deepbuddy/src/client/ui/kit.tsx`（ROW_METRICS、控件样式）
  - `plugins/deepbuddy/src/client/shell/geometry.ts`（拖拽 clamp 全部数值）
  - `plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx`、
    `ColumnFrame.tsx`（三栏结构、52px header、把手 8px 命中/1px 视觉）
  - `plugins/deepbuddy/src/client/ui/InspectorTabs.tsx`（38px tab 条）
  - `features/browser|terminal|files` 各 View（dock 内容结构）

## 必须可交互的清单（假数据、纯 vanilla JS）

1. 侧栏：折叠/展开（按钮位置迁移逻辑照真实实现：折叠后交通灯+按钮落到
   主栏左上同一水平线）；宽度拖拽 232–380、双击重置 268。
2. dock：打开/关闭；文件/终端/浏览器三分段切换（keep-alive：切换只显隐，
   浏览器假页面滚动位置不丢）；宽度拖拽 30%–70%、416px floor、双击重置；
   全屏 dockMax 与退出。
3. tab 条：浏览器/终端多 tab（+ 新建、× 关闭、chip 激活态、标题省略）。
4. 浏览器视图：地址栏（回车"导航"到内置假页面 2–3 个，地址栏同步）、
   空态（输入地址开始浏览）、拒绝嵌入态可预览。
5. 终端视图：假 prompt + 几行输出，光标闪烁；输入行可打字回显（假）。
6. 文件视图：目录树展开/收起、点文件打开预览 tab。
7. 对话流：按截图复刻——用户气泡、上下文注入行、Think 行、正文、
   底部操作 icon 行、输入框（+ 附件、权限、模型选择、发送按钮）、
   底部统计行。hero 新任务页（探索未至之境 + 居中输入卡）。
8. 拖拽实现照搬真实语义：pointer capture、rAF 合并、clamp 数值同
   geometry.ts。

## 约束

- 单文件 `index.html`；无构建、无外部依赖、无网络请求。
- 字体链与真实一致（"Departure Mono", "Fusion Pixel", monospace…），
  不内嵌字体文件（用户本机已装）。
- 假数据文案抄截图（会话名、消息内容照抄即可）。
- 注释轻量：只在各交互模块头部一行说明 + CSS 变量区顶部标注
  「与 tokens.ts / tokens-computed.json 对应」。
- 不改 plugins/、apps/ 下任何文件；不 commit。
- 桌面窗口细节（交通灯）用 web 版的模拟圆点（截图即 web 版）。

## 自查与交接

- 打开 file://…/prototype/index.html，把上面 1–8 逐条过一遍。
- 与 7 张截图并排对比布局/配色/密度。
- handoff 写到 `.agents/handoffs/2026-08-24-html-prototype.md`：
  逐条交互清单的自查结果 + 未还原项如实列出。
