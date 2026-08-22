# dsh-plugin-deepbuddy

DeepBuddy 发行版的界面层。一个三栏桌面应用骨架（左侧导航 / 会话区 / 右侧工作区面板），以纯插件方式**接管**官方 Web UI 的 frame 合同——自有 bundle patch 里禁掉官方 `ui-layout` 行，本插件占用内建 `root` slot 并同名重声明它的四个子槽，零底座 diff，卸载即还原官方界面。

```text
┌───────────┬──────────────────────────┬───────────────────────┬──┐
│ 🔴🟡🟢     │ 任务标题     12条消息      │ tab │ tab │ tab │ +   │活│
│ DEEPBUDDY │                          ├────────────┬──────────┤动│
│ 新建任务   │  用户消息 ▐               │ 内容视图     │ 停靠栏   │栏│
│ 助理…     │  ▌DEEPBUDDY 工具调用块     │ 图/文/终/网  │ 文件树   │  │
│ 任务列表   │  代码块 · 产物缩略图       │             │ 历史/Git │  │
│ 空间树    ├──────────────────────────┤             │          │  │
│ 用户栏    │  输入区 [空间▾][权限▾] [↑] │             │          │  │
└───────────┴──────────────────────────┴─────────────┴──────────┴──┘
```

**v2 已接真实数据面**：会话列表 / 消息流（历史 + 流式 + 工具调用）/ 发送与插话 / 新建会话 / 工作空间选择 / 文件树与文件预览全部走真实 dsh 服务；浏览器、运行概览、源代码管理三个面板视图仍为演示数据。布局与状态机规格来自 `design/design_handoff_atlas_harness/`（像素级 handoff，仓库根 `design/` 下）；视觉与交互基调按 `design/Atlas Harness 交互 Demo v2.html`（系统字体 600、圆角 6–14px、hairline 分隔线、中性灰选中态、圆形红绿灯/圆点/发送键）。

## 安装

```sh
cd /path/to/deepbuddy
dsh plugin --profile deepbuddy add ./plugins/deepbuddy
dsh --profile deepbuddy web --port 3081
```

源码 checkout 用 `pnpm dsh ...`。卸载：`dsh plugin --profile deepbuddy remove dsh-plugin-deepbuddy`（官方 shell 立即还原）。

## 功能面

- **三栏骨架**：侧栏 256px（拖 200–320，双击手柄重置）；会话区弹性 min 380；面板 `clamp(420px, 38vw, 720px)`（拖 25vw–60vw）。拖拽写 `flex-basis`。
- **响应式收起**（优先级 停靠栏 → 侧栏 → 面板）：窗宽 <1060 自动关面板（手关的不自动重开）、<820 折叠侧栏；面板 <545px 自动收停靠栏；经活动栏展开停靠栏时先把面板加宽到 580，放不下则拒绝展开。
- **侧栏（真实数据）**：红绿灯窗口行（`-webkit-app-region: drag`）、品牌行、一级导航（新建任务走官方 `workspaces.startSession`）、真实会话列表（displayTitle + 相对时间 + 运行中标记，点击 `sessions.open`）、空间树（真实 workspace → 成员会话）、用户栏。折叠后控件迁入会话区标题栏。
- **会话区（真实数据）**：空会话态（场景段控件 + 2×2 建议卡，工作空间标签为真实路径）/ 消息流（真实 ConversationSnapshot：用户/插话气泡、assistant 文本与 reasoning 块、工具调用折叠块含参数/结果/耗时/错误、turn-error、流式 partial + 思考红点、加载更早分页、贴底自动滚动）/ 输入区（真实工作空间 drop-up 带搜索与「打开本地文件夹」、权限三档 drop-up 为 UI 演示、发送 `session.prompt`——运行中即插话 steer、停止按钮 `session.cancel`、promptError 红字）。
- **工作区面板**：浏览器式压缩标签条（文件 tab 真实）；活动栏四视图（概览/文件/浏览器/Git）；停靠栏文件树为真实懒加载树（`deepbuddyFiles/*` 端点，会话围栏）；文件内容视图真实（文本/二进制/截断/拒绝态）；浏览器与概览与 Git 视图为演示数据；最大化铺满（红绿灯迁入标签栏，内容居中 920px）。
- **设置弹窗**：圆角 surface dialog，Esc/遮罩关闭。Esc 同时关闭全部 drop-up。

## 与官方 shell 的关系

- **接管 frame 合同（P4a）**：`cordis.patch.yml` 里 `- id: ui-layout / disabled: true`，`apply` 里把 DeepBuddy 的 chrome 注册进 `root` 并**同名重声明**官方的四个子槽（`sidebar` / `conversation` / `details` / `shell.overlay`），四个都真渲染。ui-slots 只认一个声明者，所以这是全有或全无：接管合同就得把座位全开着。官方 ui-layout 一禁用，`ctx.layout` 与 theme presenter 也一并由本插件提供。
- **官方 ui-sidebar / ui-conversation 行保持启用**：它们照常注册进 `sidebar` / `conversation`（priority 0），DeepBuddy 的占用者以 `priority: -1` 压在下面渲染（single slot 最低者渲染）——官方表面不渲染但服务全部存活。换掉它们是 P4b / P4c，不是本阶段。
- **开放面已点亮**：`shell.overlay` 里的生态插件（工作区抽屉等）在 DeepBuddy 界面里正常出现并可用；`details` 列常闭但子树保持挂载，宽度由 `ctx.layout.openDetails/closeDetails` 驱动。
- 卸载插件即释放全部注册与那条 disable，官方页面与其全部插件表面（审批、Trajectory 等）恢复。
- 样式全部圈在 `.dbdy` 根类下（自有 `--color-*` tokens）；落在开放面里的生态内容消费官方 `--dsw-alias-*`，两套 token 并存——统一成一套是 R3 主题桥接的活。
- Electron 内（UA 含 Electron）模拟红绿灯替换为等宽占位，由壳的 hiddenInset 原生控件补位；标题栏为窗口拖拽区。

## 数据面（v2）

- 直接注入 `ctx.sessions` / `ctx.workspaces`（与官方组件消费同一批 ObservableSnapshot 服务），类型全部从 `ClientContext` 派生（`src/client/dsh.ts`），抗 harness 版本漂移。
- 文件树/文件读取走本插件 host 半部自持的 `deepbuddyFiles/listDirectory|readFile` Typert Remote 端点（host：`src/host.js`，session 围栏 + rc.6 sessionPersistence 回退；client 线：`src/client/files.ts`，含 session 水合重试）。
- `prompt` 非乐观更新：消息经事件回放落进快照；运行中发送即 steer 插话。

## 已知边界（v2）

- 浏览器视图、运行概览、源代码管理停靠栏为演示数据（界面已标注「演示」）。
- 权限三档、模型选择（Auto）为 UI 占位，不影响真实会话。
- 窗口 resize 不重钳制手动拖出的面板宽度（与设计原型行为一致）。

## 开发

```sh
pnpm --filter dsh-plugin-deepbuddy build       # lib/index.js + lib/client.js
pnpm --filter dsh-plugin-deepbuddy test        # 构建 + 契约/几何测试
pnpm --filter dsh-plugin-deepbuddy typecheck
```

桌面壳见 `apps/desktop/`（Electron，加载本地 `dsh web`）。
