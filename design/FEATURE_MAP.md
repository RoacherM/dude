# Dude 功能地图

> 用途：把 Dude 自研的功能落到明确区域、数据源和状态 Owner。
> 它是现状清单，不是长期公共 API。

---

## 1. 顶层功能

| 模块 | 区域 | 职责归属 | 数据 / 能力来源 | 状态 Owner |
|---|---|---|---|---|
| Desktop Shell | 全窗 | Dude | Electron Window / 原生集成 | Electron Main |
| Sidebar | 左列 | DSH 官方 | DSH Workspaces / Sessions | DSH 官方 |
| Conversation | 主列 | DSH 官方 | DSH Session Log / Agent | DSH 官方 |
| Rightbar（Files 等） | 右列 | DSH 官方（dockkit） | DSH Files / Workspaces | DSH 官方 |
| Settings | 弹层 | DSH 官方 | DSH Settings / Models / Presets | DSH 官方 |
| 窗口拖拽区域 | 官方元素空白处 | Dude | CSS `-webkit-app-region` | `ctx.effect`（样式表） |
| Hero 品牌标记 | 官方 Hero | Dude | `conversation.hero.brand.mark` 槽 | `ctx.effect`（slot 注册） |
| 正文字体 | 全窗 | Dude | `--dsw-font-family` 覆写 | 随样式表安装 |

除去窗口拖拽区域、Hero 品牌标记和正文字体这三项，其余全部是 DSH 官方原生能力，
Dude 不做任何包装或代理。

---

## 2. Dude 自研范围

Dude 客户端只有两个模块（见 `ARCHITECTURE.md` §3）：

- `dsh/adapter.ts`：安装样式表、注册 Hero 品牌标记，各自一个独立的 `ctx.effect`；
- `ui/styles.ts` + `ui/fonts.ts`：纯 CSS 常量，被 `adapter.ts` 安装。

`src/host.js` 是空实现（只有 `name` 和一个空 `apply`）——没有 host 侧业务逻辑。

没有 Feature 目录、没有静态 Catalog、没有 Layout Store、没有 Resource Manager。

---

## 3. 之前存在、现已删除的功能

以下功能曾经由 Dude 自己实现，现已整体删除，由官方 dockkit 右栏（自带 Files 页）
取代：

- Inspector（Terminal / Browser / Files 预览的多 Tab 右栏）；
- 三列布局壳（`ThreeColumnFrame` / `ColumnFrame` / Layout Store）；
- KIT 组件库与设计令牌（`--db-*`）；
- Preset Plane（roster / staged / busy 共享状态）；
- Session 围栏与 host 侧 `deepbuddyFiles/*` 端点、`/deepbuddy/media`、
  `/deepbuddy/terminal`；
- `node-pty` / `ws` / `xterm` 等运行时依赖。

不要为了恢复其中某一项而重建平行实现——如果官方 dockkit 已经覆盖同等能力（例如
Files 预览），直接消费官方能力；如果官方确实没有，新增前先确认这是不是第三个真实
需求（Rule of Three），并优先通过官方公开 Slot 挂载，而不是自建一整套右栏。

---

## 4. 完成定义

Dude 当前架构被认为跑通，当：

- 官方 Sidebar / Conversation / Rightbar 全部原生可用，Dude 未做任何包装；
- 插件卸载后官方界面完整可用，没有残留状态或死代码路径；
- 窗口拖拽区域覆盖 macOS 无边框窗口的可用性需求，且不挡任何官方控件点击；
- Hero 品牌标记正确渲染 Dude 版本，官方标题与徽标不受影响；
- 客户端 bundle 体积保持精简（当前 55KB），不夹带已删除功能的死代码。
