# Dude 功能地图

> 用途：把 Dude 自研的功能落到明确区域、数据源和状态 Owner。
> 它是现状清单，不是长期公共 API。

---

## 1. 顶层功能

| 模块 | 区域 | 职责归属 | 数据 / 能力来源 | 状态 Owner |
|---|---|---|---|---|
| Desktop Shell | 全窗 | Dude | Electron Window；打包版起停 dsh 子进程 | Electron Main |
| Sidebar | 左列 | DSH 官方 | DSH Workspaces / Sessions | DSH 官方 |
| Conversation | 主列 | DSH 官方 | DSH Session Log / Agent | DSH 官方 |
| Rightbar（锁定版本只有 Files 页） | 右列 | DSH 官方（dockkit） | DSH Files / Workspaces | DSH 官方 |
| Settings | 弹层 | DSH 官方 | DSH Settings / Models / Presets | DSH 官方 |
| 窗口拖拽区域与红绿灯避让 | 左栏、Hero 页、右栏 Tab 栏、会话标题栏；右栏全屏面板 | Dude | CSS `-webkit-app-region`、`padding`、anchor positioning | `ctx.effect`（样式表） |
| Terminal / Browser | 右列 | 缺口：锁定版本官方没有 | 上游 0.1.6 的 `ui-sidebar-terminal` / `ui-sidebar-browser` | 升级后归 DSH 官方 |

除去窗口拖拽区域与红绿灯避让这一项，其余全部是 DSH 官方原生能力（包括 Hero 的鲸鱼
品牌标记），Dude 不做任何包装或代理。

---

## 2. Dude 自研范围

Dude 客户端只有两个模块（见 `ARCHITECTURE.md` §3）：

- `dsh/adapter.ts`：在一个 `ctx.effect` 里安装样式表；
- `ui/styles.ts`：一段 CSS 常量和装卸它的 `installStyles()`，被 `adapter.ts` 调用。

`src/host.js` 是空实现（只有 `name` 和一个空 `apply`）——没有 host 侧业务逻辑。

没有 Feature 目录、没有静态 Catalog、没有 Layout Store、没有 Resource Manager。

---

## 3. 之前存在、现已删除的功能

以下功能曾经由 Dude 自己实现，现已整体删除。Files 预览由官方 dockkit 右栏的 Files 页
取代；终端和浏览器在锁定版本里官方还没有，是能力缺口，升级到 0.1.6 由官方补上：

- Inspector（Terminal / Browser / Files 预览的多 Tab 右栏）；
- 三列布局壳（`ThreeColumnFrame` / `ColumnFrame` / Layout Store）；
- KIT 组件库与设计令牌（`--db-*` 颜色 / 间距变量）；
- Preset Plane（roster / staged / busy 共享状态）；
- Session 围栏与 host 侧 `deepbuddyFiles/*` 端点、`/deepbuddy/media`、
  `/deepbuddy/terminal`；
- `node-pty` / `ws` / `xterm` 等运行时依赖；
- Archivo 正文字体：官方样式压过了它，从未生效，已删除；
- Hero 胖蓝鱼标记（`DudeBrandMark`）：Hero 改回官方鲸鱼。

不要为了恢复其中某一项而重建平行实现——官方已经覆盖的（例如 Files 预览）直接消费；
官方即将提供的（终端、浏览器）等升级；官方确实没有的，新增前先确认这是不是第三个真实
需求（Rule of Three），并优先通过官方公开 Slot 挂载，而不是自建一整套右栏。

---

## 4. 完成定义

Dude 当前架构被认为跑通，当：

- 官方 Sidebar / Conversation / Rightbar 全部原生可用，Dude 未做任何包装；
- 插件卸载后官方界面完整可用，没有残留状态或死代码路径；
- 窗口拖拽区域覆盖 macOS 无边框窗口的可用性需求，红绿灯不压官方控件，且不挡任何
  官方控件点击（左栏展开 / 收起、右栏全屏都成立）；
- Hero 显示官方鲸鱼，Dude 不注册任何 slot；
- 客户端 bundle 体积保持精简（当前约 6KB），不夹带已删除功能的死代码。
