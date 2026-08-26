# 任务书：视觉 v2（浮岛 + Archivo）落实现

- 日期：2026-08-26 ｜ 开发：claude opus（Herdr pane）｜ 验收与提交：Claude（主会话）
- 目标：把已验收的 `design/prototype/index.html` 视觉 v2 落到 `plugins/deepbuddy/src/client/`

## 必读（按顺序）

1. `design/DESIGN_INTENT.md` §2 / §3 / §10 —— 规格（几何基线含 1/3 上限与浮层兜底，已是定稿）
2. `.agents/handoffs/2026-08-26-visual-v2-implementation.md` —— 逐文件落地路径（§2.4 含新几何公式与测试断言新值）
3. `design/prototype/index.html` 的 `:root` 块 —— token 成品可直接抄；`clampDock`/`dockFits`/`canSplitDock`/浮层兜底逻辑是行为参照

## 范围（handoff §2 清单 + 本轮新增几何语义）

- §2.1 `ui/tokens.ts`：新增 `--db-panel/raised/void/gap/brand/line-panel/brandfont`，按表改值与断链（断链清单见 handoff §1），`METRICS` 加 `gap: 10`
- §2.2 `ui/fonts.ts`：Archivo latin 子集 vendored（从 `design/prototype/fonts.css` 第 3 行 base64 解出，34KB woff2）；Departure Mono 保留只做字标；**删除 `fusion-pixel-zh.woff2`（645KB）及其引用**；重写顶部过期注释
- §2.3 浮岛外壳：`ThreeColumnFrame.tsx` / `ColumnFrame.tsx`（窗口底 + gap 内边距、三列圆角面板、把手占满 10px 缝、字标行 + 红点、dockMax 浮层 `inset: gap`）
- §2.4 几何：`geometry.ts` + `layout-store.ts`
  - 比例按窗口宽；`DOCK_MAX_RATIO` 0.70 → **1/3**
  - `clampDock`: `min = max(vw*.30, 416)`；`max = max(min, min(vw/3, vw - 2*GAP - side - GAP - 460))`
  - `dockFits = vw - 2*GAP - side - GAP - 460 >= 416`
  - **放不下不拒绝**：`!dockFits || vw < 1100` 时打开 dock 直接进 dock-max 全屏浮层；退出浮层若分栏仍放不下则收起；响应式自动收列只作用于分栏形态
  - 侧栏贡献 `+1` → `+GAP`；`tests/plugin.test.mjs` geometry 断言按新公式重推（`clampDock(10_000, 1440, 278) === 480` 等）
- §2.5 停靠栏三视图：`terminal/browser/files` 嵌入式 `--db-void` 黑块、地址栏无描边、树行 28/`r-control`、`InspectorTabs` 圆角
- §2.6 `ui/icons.tsx`：`Maximize`/`Minimize` 换 Lucide 四角括号 path（handoff 内附 path）

## 红线（违反即打回）

1. handoff §3 列的「已经是对的别动」：`App.tsx` DockToggle 让位逻辑、三列两区结构、layout-store 状态机、拖拽 rAF 节流
2. handoff §5 硬约束：红只做品牌（唯一红点在侧栏字标旁）、蓝只做行动、**选中态不用色**、不碰官方 row/组件（handoff §0 权属表里标「官方」的一律不动，靠 token 顺带变）
3. `SIDEBAR_BREAKPOINT` 860 / `DOCK_BREAKPOINT` 1100 不动
4. **不要 commit**——验收方（主会话 Claude）负责提交
5. 外科手术式修改：不顺手重构、不加兼容层/fallback

## 完成定义（DoD）

- `cd plugins/deepbuddy && pnpm typecheck && pnpm test` 全绿（geometry 断言已按新口径重写）
- `pnpm build` 通过，产物字体包体减少 ~600KB（fusion-pixel 已删）
- 自查：`node_modules/.bin/dsh --profile deepbuddy --port 3082 --no-open`（`DSH_HOME=~/.deepbuddy`，**别动 ~/.dsh**）与 `design/prototype/index.html` 并排目测四态；测完 kill 自己起的实例
- 完成后在 pane 里输出：改动文件清单 + 测试输出摘要 + 未尽事项

## 验收流程（主会话执行，开发者知悉即可）

typecheck/test 复跑 → 3082 真机与原型并排对照（1440 四态、1200 分栏钳制、1120/880 浮层兜底）→ 字体包体确认 → 通过后统一 commit
