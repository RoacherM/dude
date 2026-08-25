# DeepBuddy 交互原型（UI 设计基线）

> 状态：**现行 UI 设计基线。后续 UI/交互改动一律先在本原型上迭代，
> 验收通过后再落到 `plugins/deepbuddy/` 实现。**

## 是什么

对 DeepBuddy 真实界面的高保真、可交互、零依赖复刻：

- `index.html` — 单文件原型（内嵌 CSS / SVG 图标 / vanilla JS / 假数据）。
- `fonts.css` — Departure Mono + Fusion Pixel 的 base64 @font-face
  （从插件样式提取；file:// 页面看不到应用内嵌字体，必须引它）。

**两个文件必须一起分发**，缺 `fonts.css` 会退化成系统字体。

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

- 396+ 个 `--db-*` / `--dsw-*` 设计 token 与真实同名同值；浮层/对话框的
  尺寸、圆角、配色、字号全部采自真实 app 的 computed style，采集数据存于
  `.agents/reference/proto-ref/`（popovers.json、settings-dialog.json、
  tokens-computed.json、真实界面截图）。
- 图标是从真实 DOM 收割的 SVG symbol（`#i-*` sprite）；新增面请复用
  sprite，不要手绘近似图标。
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
