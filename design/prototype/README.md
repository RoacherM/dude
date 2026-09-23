# DeepBuddy 交互原型（UI 设计基线）

> 状态：**现行 UI 设计基线。后续 UI/交互改动一律先在本原型上迭代，
> 验收通过后再落到 `plugins/deepbuddy/` 实现。**

## 是什么

DeepBuddy 界面的高保真、可交互、零依赖原型：

- `index.html` — 单文件原型（内嵌 CSS / SVG 图标 / vanilla JS / 假数据）。
- `fonts.css` — Archivo（latin 子集）+ Departure Mono + Fusion Pixel 的 base64
  @font-face；file:// 页面看不到应用内嵌字体，必须引它。

**两个文件必须一起分发**，缺 `fonts.css` 会退化成系统字体。

> **视觉 v4/v5（2026-09-22 · 竖线工作流与最新品牌极简基线）**：去除了原有的 floating 悬浮外壳与所有独立浮动边框卡片，全面对齐官方连续平铺工作台与 Synara UI 细节：
> - **官方最新几何 Logo 与极简 Hero 品牌基线**：彻底去除旧版本玩具级的蓝鲸鱼卡通吉祥物、base64 图片、Departure Mono 像素字标与像素 Slogan；全面对齐 Synara 及官方最新设计语言，使用纯净的几何黑白 SVG 标识（`i-app-logo`，对应 `SynaraLogo`）与现代无衬线标题（`Let's build`），搭配轻巧的工作区胶囊选择器；
> - **竖线工作流（Vertical Timeline）**：彻底消除原 `.context-row`、`.think-row` 等浮动边框卡片，采用类似 Synara 的左侧贯穿垂直指引细线（`1.5px solid var(--db-line-seam)`）与节点圆（node indicators），统一承载上下文注入、推理思考（Thinking）和工具调用（Tool execution）；
> - **交互式折叠摘要**：对齐 Synara 的 `ToolCallGroupSummaryRow`，步骤头部呈现为一键展开/收起的语义摘要（如 `✓ 已执行操作 · 3 步 (1.8s) ⌄`），支持丝滑展开/收起竖线流程；
> - **平铺工作台咬合**：满屏平铺贴边（`padding: 0`，外框圆角归零），三列由 1px 精细 seam-line 缝隙垂直裁切分隔；
> - **自然平贴气泡**：用户消息采用现代极简微圆角矩形气泡（`12px`），平贴底色并带悬浮显示的操作栏，告别卡通不对称气囊边角；
> - **树形竖线延伸**：侧栏目录树与停靠栏文件树的二级及更深层级统一配备 `border-left` 垂直播放线，形成整体一致的竖线视觉语言；
> - **侧栏规范对齐**：侧栏顶部完全移除品牌字标，仅保留红绿灯与折叠按钮（品牌字标只在 Hero 出现一次）。
> - **方案 A 落地约束**：原型作为平铺无缝质感、色阶与竖线交互的视觉设计基线；代码落地严格执行【方案 A 官方优先】——直接消费 DSH 官方侧栏与布局能力，不造重复平行的侧边栏外壳。
> - 历史浮岛版本保留于 `index-v2-floating.html`。

直接用浏览器打开即可：

```bash
open design/prototype/index.html
```

## 覆盖面

- 三列两区布局：侧栏（折叠/搜索/会话组）、主列（hero / 会话 / 轨迹）、
  停靠栏（文件 / 终端 / 浏览器），拖拽把手与 ⌘J 语义同真实实现。
- 浮层 1:1：workspace / Agent 预设下拉、权限菜单、模型两级菜单
  （模型 + 推理等级）、＋ 号命令面板（slash commands 两级）、
  设置对话框（800×800 四 tab）。
- 交互铁律：**零静默死点**——出现在界面上的每个可点控件要么真实响应，
  要么呈 disabled 视觉；占位功能统一右下角 toast。

## 保真方法（改原型前必读）

- **结构与尺寸**仍来自真实 app：状态栏 52 / 主行 31 / 密行 26、侧栏 268、
  设置对话框 800×800 四 tab、浮层的层级与触发方式，采集数据存于
  `.agents/reference/proto-ref/`（popovers.json、settings-dialog.json、
  tokens-computed.json、真实界面截图）。
- **配色、字体、圆角**从 v2 起以 `DESIGN_INTENT.md §10` 为准，不再与真实 app
  的 computed style 逐一对齐 —— 视觉重设计就是要改掉它们。`--dsw-*` token 保留
  原名，字体族统一指向 `var(--db-font)` / `var(--db-mono)`。
- 图标是从真实 DOM 收割的 SVG symbol（`#i-*` sprite）；新增面请复用
  sprite，不要手绘近似图标。重设计稿用的是 Lucide 线性图标，与 sprite 同风格。
- 假数据不得包含任何真实密钥 / 凭据 / 内部 URL。

## 迭代规则

1. 新 UI 需求 → 先在 `index.html` 上改出可交互效果并自查零死点。
2. 与真实 app 并排目测（必要时重新采集 computed style 进 proto-ref）。
3. 验收通过后，按原型规格在 `plugins/deepbuddy/src/client/` 落实现；
   实现与原型不一致时，以最新验收过的原型为准。
4. 每轮改动更新 `.agents/handoffs/2026-08-24-html-prototype.md`。

## 复测入口

```bash
node -e 'const fs=require("fs");const h=fs.readFileSync("design/prototype/index.html","utf8");new Function(h.slice(h.indexOf("<script>")+8,h.lastIndexOf("</script>")));console.log("inline JS parse: PASS")'
```
