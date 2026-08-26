# 视觉 v2（浮岛 + Archivo）落实现 handoff

- 日期 / agent：2026-08-26 / claude
- 目标：把已验收的 `design/prototype/` 视觉 v2 落到 `plugins/deepbuddy/src/client/`
- 前置：原型侧的改动记录见 [`2026-08-25-visual-v2.md`](./2026-08-25-visual-v2.md)

## 现状

原型已是 v2 并经用户逐项验收；实现层**一行未动**。差异全部是视觉层，
三列两区 / 四态布局 / 响应式收列语义没变。

```
design/DESIGN_INTENT.md     +61   §2 几何基线、§3 开关归属表、§10 视觉语言（重写）
design/prototype/index.html +797/-328
design/prototype/fonts.css  内嵌 Archivo latin 子集
```

**动手前先读 `design/DESIGN_INTENT.md §2 / §3 / §10`** —— 那是规格，本文只是落地路径。

---

## 0. 先看权属：一半的改动不在我们地盘

wave 8 之后主列整列是官方 `ui-conversation` 的 `ConversationRoot`，侧栏的工作空间
与会话列表是官方 `sidebar.workspaces` 槽，设置是官方 `sidebar.settings` → `SettingsRoot`。
原型是**整屏**重画的，所以它有相当一部分内容 DeepBuddy 根本不渲染。

| 原型改动 | 归属 | 落地方式 |
|---|---|---|
| 浮岛外壳（窗口底 / 面板圆角 / 描边 / 10px 缝） | DeepBuddy | 直接改，见 §2 |
| 拖拽把手占满缝 | DeepBuddy | 直接改 |
| Archivo 正文 / Departure Mono 只做字标 | 全局 | `ui/fonts.ts`，官方组件跟着变 |
| 侧栏字标行 + 红品牌点 | DeepBuddy | `shell/ThreeColumnFrame.tsx` `DeepBuddySidebar` |
| 「新建任务」标签左对齐 + ＋压右缘 | DeepBuddy | `features/conversation/Chat.tsx` |
| 停靠栏 tab / 终端黑块 / 浏览器地址栏 / 文件树 | DeepBuddy | `features/{terminal,browser,files}` |
| 全屏 / 退出全屏图标 | DeepBuddy | `ui/icons.tsx` |
| **会话行状态点、选中态** | **官方** | 只能靠 `--dsw-*` 覆盖影响，或不做 |
| **视图 Tab 收进主列状态栏** | **官方** | 本轮**不做**（要改官方 row，超出视觉升级范围） |
| **消息气泡 / 工具卡 / composer / hero** | **官方** | 只能靠 token 影响 |
| **设置对话框** | **官方** | 只能靠 token 影响 |

> 结论：本轮实现目标是**外壳 + 停靠栏 + 全局 token/字体**。官方那半屏靠 token 顺带变，
> 变不到位的记下来，不要为了对齐原型去改官方组件。

---

## 1. 最大的一个决策：`--db-*` 要断链

`ui/tokens.ts` 现在每个 `--db-*` 都 chain 到官方 `--dsw-*` 并带 fallback，
注释里写明这是 UI-unify 的目的（"share the official main column's palette
instead of a parallel Synara set"）。

v2 的底色和圆角**故意偏离**官方调色板 —— 浮岛需要一个比面板更深的窗口底，
官方没有这个角色；圆角从 22 收到 12/20 也不是官方值。所以必须决定哪些断链。

建议的切法（保持"能跟官方走的继续跟"）：

- **断链**：`--db-window`、`--db-popover`、`--db-dialog`、全部 `--db-r-*`、
  新增的 `--db-panel` / `--db-raised` / `--db-void` / `--db-gap` / `--db-brand`
- **保持 chain**：`--db-text-*`、`--db-line-*`、`--db-fill-*`、`--db-run` / `--db-await` /
  `--db-primary`（v2 的绿橙微调可以直接吃官方值，差异肉眼难辨）

断链的地方在 `tokens.ts` 顶部注释里补一句为什么，别让下一个人以为是退化。

---

## 2. 逐项清单

### 2.1 `ui/tokens.ts` — token 表

新增角色：

```
--db-panel   #151517   列面板（= 旧 --db-window 的值）
--db-raised  #1c1c1f   面板内抬升：composer
--db-void    #0e0e10   嵌入式黑底：终端 / 文件预览 / 浏览器空态
--db-gap     10px      浮岛间隙 = 窗口内边距 = 把手宽度
--db-brand   #ec3013   品牌红
--db-line-panel  rgba(255,255,255,.05)   浮岛外框
--db-brandfont   Departure Mono 栈
```

改值：

| token | 旧 | 新 |
|---|---|---|
| `--db-window` | `#151517`（chain bg-base） | `#0b0b0c` 断链 |
| `--db-rail` | `#1b1b1c`（chain sidebar-fill） | `var(--db-panel)`，三列同色 |
| `--db-popover` | `#353638` | `#1f1f23` |
| `--db-dialog` | `#2c2c2e` | `#171719` |
| `--db-line` | `#ffffff0f` | `rgba(255,255,255,.06)` |
| `--db-fill-1..6` | color-mix 链 | `.02 / .045 / .06 / .085 / .12 / .16` 白 |
| `--db-text..text-5` | f9fafb…81858c | `#f4f4f5 / #d6d6db / #a6a6ad / #6f6f78 / #4a4a52` |
| `--db-run` | `#22c55e` | `#3ecf8e` |
| `--db-await` | `#d97757` | `#e9a23b` |
| `--db-offline` | `#81858c` | `#55555e` |
| `--db-r-card` / `-surface` / `-editor` | `22px` | `12px` |
| `--db-r-input` | `14px` | `16px` |
| `--db-r-row` | `8px` | `10px` |
| 阴影 popover/menu | `0 22~24px 54~60px /.68~.70` | `0 16px 40px rgba(0,0,0,.5)` |
| 阴影 dialog | `.74` | `0 32px 80px rgba(0,0,0,.6)` |

新增圆角：`--db-r-panel: 20px`、`--db-r-dialog: 24px`、`--db-r-popover: 14px`、
`--db-r-control: 9px`。

`METRICS` 加一项 `gap: 10`（几何要用它，不能只活在 CSS 里）。

完整可抄的成品在 `design/prototype/index.html` 的 `:root` 块（带中文分组注释）。

### 2.2 `ui/fonts.ts` — 字体

```
--dsw-font-family    → "Archivo", -apple-system, system-ui, "PingFang SC", …
--ds-font-family-code → ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, …
--db-brandfont        → "Departure Mono", "Fusion Pixel", ui-monospace, monospace
```

- 需要把 Archivo 的 **latin 变量子集** vendored 进 `src/client/assets/`
  （34KB woff2，`font-weight: 100 900`）。原型用的那份取自 Google Fonts v25：
  `https://fonts.gstatic.com/s/archivo/v25/k3kPo8UDI-1M0wlSV9XAw6lQkqWY8Q82sLydOxKsv4Rn.woff2`
  （已 base64 内嵌在 `design/prototype/fonts.css` 末尾，可直接解出来）。
- `departure-mono.woff2`（22KB）**留着**，字标要用。
- `fusion-pixel-zh.woff2`（**645KB**）可以删 —— 它只为"中文也走像素字"存在，
  v2 中文走 PingFang，字标 "DeepBuddy" 是纯拉丁不需要 CJK 像素字。
  **包体一把减 ~600KB**，顺手确认 `assets.d.ts` 和 `build.mjs` 没有残留引用。
- `fonts.ts` 顶部那段"用户选了全像素"的注释整段要重写，它现在是过期信息。

### 2.3 `shell/ThreeColumnFrame.tsx` + `shell/ColumnFrame.tsx` — 浮岛

- 根 `.dbdy` 容器：`background: var(--db-window)`，加 `padding: var(--db-gap)`。
- 三列各自：`background: var(--db-panel)` + `1px solid var(--db-line-panel)` +
  `border-radius: var(--db-r-panel)` + `overflow: hidden`。
  现在列背景散在几处写死 `var(--db-window)`（`ThreeColumnFrame.tsx:186/187/285`），
  收敛到 `ColumnFrame` 里一处。
- `Handle`（`ColumnFrame.tsx:70-100`）：`flex: '0 0 8px'` / `width: 8` / `margin: '0 -3.5px'`
  → `flex: '0 0 var(--db-gap)'` / `width: var(--db-gap)` / **去掉负 margin**；
  里面那根常驻 1px 线改成默认透明、hover 与拖拽中才亮 `var(--db-primary)`
  （2px 圆头，上下各内缩 22px）。拖拽中的状态需要一个 class，原型里叫 `.dragging`。
- dockMax 浮层（`ThreeColumnFrame.tsx:186`）：`inset: 0` → `inset: var(--db-gap)`，
  否则铺进窗口内边距、压掉浮岛的缝。
- 红绿灯（`ColumnFrame.tsx:31-33`）：12px → 11px，gap 8 → 7。
- 侧栏字标行：折叠按钮从左侧移到最右（`marginLeft: auto`），字标用
  `var(--db-brandfont)` 13px/400/letter-spacing .02em，字标后面跟一颗
  7×7、`borderRadius: 2`、`background: var(--db-brand)` 的方点。
- 侧栏收起时主列左上角的 lockup（`ThreeColumnFrame.tsx:328` 一带）位置要重新对，
  同时检查 `.dbdy-noside` 给官方 header title 的缩进（在 `tokens.ts` 里）。

### 2.4 `shell/geometry.ts` + `shell/layout-store.ts` — 几何要吃掉 gap

浮岛让每列多花 `2 × gap`（窗口内边距）+ 每条缝 `gap`。两处硬编码要跟着改：

- `layout-store.ts:195 sideWidth()` 的 `+ 1` → `+ GAP`
  （旧的 1 是因为 8px 把手带 -3.5 负 margin，净占 1px；现在净占 10px）。
- `geometry.ts`：**口径已定（2026-08-26，原型已实装并验收）**——
  比例一律按**窗口宽**计算；gap 预算只进「主列保留 460」的扣减项。
  同时用户新增硬约束：**右列不超过窗口 1/3**（`DOCK_MAX_RATIO` 0.70 → 1/3），
  与 416px 下限冲突的窄窗小区间以 416 优先。新公式（对照原型 `clampDock`）：
  `min = max(vw * 0.30, 416)`；
  `max = max(min, min(vw / 3, vw - 2*GAP - side - GAP - 460))`（side 已含自己的缝）；
  `dockFits = vw - 2*GAP - side - GAP - 460 >= 416`。
  另一条新语义（2026-08-26 用户确认方向，原型已实装）：**放不下不再拒绝打开**——
  `!dockFits || vw < 1100` 时 toggle 直接以 dock-max 全屏浮层打开；退出浮层时若分栏仍
  放不下则收起；响应式自动收列只作用于分栏形态（浮层留给用户自己关）。
  对应改 `layout-store` 的 dock 打开路径与 resize 逻辑，`dockFits` 保留为「能否分栏」判据。
- `SIDEBAR_BREAKPOINT` 860 / `DOCK_BREAKPOINT` 1100 **不动**（DESIGN_INTENT §2 已写明
  阈值按窗口宽度判断，不因浮岛调整）。
- `tests/plugin.test.mjs:637-658` 的数字会全线变：侧栏贡献 `269` → `278`（268 + 10px 缝）；
  `clampDock(10_000, 1440, 278) === 480`（1/3 上限生效，不再是 711）；
  `clampDock(10_000, 1440, 0) === 480`（同样吃 1/3 上限，不再是 980）。
  按上面的公式重推全部断言。

### 2.5 `features/` — 停靠栏三视图

- `terminal/TerminalView.tsx`：终端屏改成嵌进面板的黑块 ——
  `margin: 0 12px 12px` + `border: 1px solid var(--db-line-panel)` +
  `borderRadius: var(--db-r-card)` + `background: var(--db-void)`，
  字号 13 → 12 / line-height 1.8，prompt 色从 `#46c9f0` 改 `var(--db-text-4)`。
- `browser/BrowserView.tsx`：工具栏改 `padding: 12px 12px 0` 无下边框；
  地址栏无描边、`background: var(--db-fill-2)`、`borderRadius: var(--db-r-control)`；
  页面区同样包成 `--db-void` 圆角块。
- `files/FilesView.tsx`：树行高 28、`var(--db-mono)` 12.5px、
  `borderRadius: var(--db-r-control)`；预览 `<pre>` 换 `--db-void` 底 + `r-card`。
- `ui/InspectorTabs.tsx`：tab 圆角 8 → `var(--db-r-control)`，关闭键 20 → 16/r5。

### 2.6 `ui/icons.tsx` — 全屏图标

现在的 `Maximize` / `Minimize`（第 55-61 行）是一对对角箭头，**本身是成对的、没错**；
原型那边曾经不成对，已改成 Lucide 的 `maximize` / `minimize`（四角括号，朝外/朝内）
并经用户看过。按"原型是基线"，实现这两个函数的 path 换成：

```
Maximize: M8 3H5a2 2 0 0 0-2 2v3 / M21 8V5a2 2 0 0 0-2-2h-3 / M3 16v3a2 2 0 0 0 2 2h3 / M16 21h3a2 2 0 0 0 2-2v-3
Minimize: M8 3v3a2 2 0 0 1-2 2H3 / M21 8h-3a2 2 0 0 1-2-2V3 / M3 16h3a2 2 0 0 1 2 2v3 / M16 21v-3a2 2 0 0 1 2-2h3
```

---

## 3. 已经是对的，别动

- **`app/App.tsx:52` `DeepBuddyDockToggle` 的让位逻辑**（`if (dock && sessionStarted) return null`）
  —— 用户在原型上提的"两颗开关冗余"，实现这边**本来就做对了**，是原型漏了。
  规则已补进 `DESIGN_INTENT.md §3` 的开关归属表。
- 三列两区结构、四态布局、`layout-store` 的状态机、拖拽的 rAF 节流。
- `--db-*` 挂在 `.dbdy` 作用域下与官方 `--dsw-*` 主题隔离的做法。

## 4. 已知会对不齐的地方（预期内，先记下来别追）

- 主列的视图 Tab 仍是官方独立一行，不会像原型那样收进 52px 状态栏。
- 消息气泡的 `16/16/4/16` 不对称圆角、工具卡描边样式，官方 chat 折叠不吃 `--db-*`。
- 会话行的运行/等待状态点是原型加的，官方会话列没有这个投影。
- 设置对话框的圆角/间距由官方 `SettingsRoot` 决定。

这四条要不要做，等视觉 v2 外壳落地后**并排看一眼再决定**，不要在本轮里顺手改官方 row。

---

## 5. 关键决策与约束（用户已确认）

1. 字体按重设计走 **Archivo 正文**，Departure Mono 只做品牌字标 ——
   这**推翻**了此前"Departure Mono 全局、勿改回"的偏好，不要再覆盖回去。
2. **红只做品牌**：全界面只有侧栏字标旁那颗方点是红的。不标选中 ——
   会话行、设置分区的选中态一律只靠底色。（用户连着提了两次，是硬约束。）
3. 蓝只做行动：发送键、`:focus-visible` 环、菜单选中勾。
4. 本轮只改视觉，不碰三列两区语义、不碰响应式阈值、不改官方 row。

## 6. 复测入口

```bash
cd plugins/deepbuddy
pnpm typecheck
pnpm test                 # 含 tests/plugin.test.mjs 的 geometry 断言

# 视觉基线并排对照
open ../../design/prototype/index.html
```

桌面端按 `.agents/handoffs/2026-08-24-*` 的老规矩：动到 webview / 手势才需要
CDP 真机注入验收；本轮纯样式 + 几何，跑通 `pnpm test` 后目测四态布局即可。

验收要过的面（DESIGN_INTENT §14）：四种布局状态、窄窗自动收列（1100 / 860）、
长标题截断、无 Session、运行中与等待批准、Inspector 0/1/多实例、
Terminal 切 Tab 与收列后仍在跑、键盘 Focus 与减少动态效果。
