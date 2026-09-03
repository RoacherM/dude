# dsh-plugin-deepbuddy

DeepBuddy 发行版的界面层。一个三栏桌面应用（侧栏 / 主列 / 检查器），以纯插件方式
**接管**官方 Web UI 的 frame 合同——自有 bundle patch 里禁掉官方 `ui-layout` 行，
本插件占用内建 `root` slot 并同名重声明它的四个子槽，零底座 diff，卸载即还原官方界面。

界面按「模块化单体 + 静态组合」组织（`design/ARCHITECTURE.md` §11
映射到本插件 `src/client/` 内部；`main/`、`preload/` 由 `apps/desktop` 承担）：

```text
src/client/
├── app/            # 装配（App.tsx）+ 静态目录（catalog.ts）+ 每 fiber 依赖上下文（context.tsx）
│   └── catalog.ts  # WORKBENCH_APPS / SIDEBAR_SECTIONS / INSPECTOR_VIEW_TYPES 三个静态数组
├── shell/          # ThreeColumnFrame（root 占用者 + 三列容器）/ ColumnFrame（52px 状态栏 + 功能区）
│   ├── layout-store.ts   # 列显隐与宽度、当前 App、Inspector 实例与 Active ID、拖拽与快捷键
│   └── geometry.ts       # 纯布局算术（拖拽 clamp / 响应式收起），可脱离 DOM 测试
├── dsh/            # 唯一理解 DSH ABI 的层：adapter（wire 束 + 官方 root/frame 槽接管）
│   ├── files.ts    # deepbuddyFiles/* 端点客户端线
│   ├── presets.ts  # agent-presets api 面 + 共享 PresetPlane（roster / staged / busy）
│   ├── theme-presenter.ts
│   └── hooks.ts    # useSnapshot / useStore
├── features/       # 每 Feature 只从 index.ts 导出薄 Definition
│   ├── conversation/  # 对话视图 + 侧栏入口行（新建任务）
│   ├── sessions/      # 会话列表 section（任务 / 空间）
│   ├── settings/      # 设置 App（模式页 + 插件页，rail 内部分页）
│   └── files/         # 检查器文件树视图（多文件 Tab 实例）
└── ui/             # kit（Object.freeze(KIT)）/ tokens（设计令牌与样式）/ icons
```

```text
┌───────────┬──────────────────────────┬───────────────────────┐
│ 🔴🟡🟢     │ 会话标题        ┌──┐      │ 文件 │ tab │ tab │ × │
│ DeepBuddy │ 对话   [+ 新建]  │ 打开  │  ├────────┬──────────┤
│ 对话       │  用户消息 ▐      │ 停靠栏 │  │ 文件树   │ 文件内容  │
│ 任务 (N)  │  ▌工具调用块      │ └──┘  │  │         │          │
│ 空间 (M)  ├──────────────────┤       │  │         │          │
│ 设置       │  输入区 [工作空间][模式][↑] │  │         │          │
└───────────┴──────────────────────────┴────────────┴──────────┘
```

## 架构要点

- **静态目录组合**：新增面板 = `features/<name>/` 写组件 + 导出薄 Definition +
  `app/catalog.ts` 加一行（`WorkbenchAppDefinition` / `SidebarSectionDefinition` /
  `InspectorViewTypeDefinition`）。Shell 只读目录与 layout store 的 Selection 渲染，
  不出现 `if (app.id === …)` 业务分支；删除某个 Feature 不需要改动其他 Feature。
- **每列两区**：三列共用 `ColumnFrame`（52px 状态栏 + 功能区），状态栏内容由列 Props
  提供，Feature 不提交任意 Header 组件。
- **状态所有权**（ARCHITECTURE §6）：布局归 shell/layout-store；领域数据归 DSH，经
  dsh/adapter 投影成稳定 Snapshot（会话列表、roster 共享 PresetPlane）；Feature 局部
  状态留在 Feature。每 fiber 一份 store，经 app/context 注入各 slot 树。
- **接管 frame 合同（P4a）**：`cordis.patch.yml` 里 `- id: ui-layout / disabled: true`，
  `apply` 里把 DeepBuddy 的 chrome 注册进 `root` 并**同名重声明**官方的四个子槽
  （`sidebar` / `conversation` / `details` / `shell.overlay`），四个都真渲染。
  ui-slots 只认一个声明者，所以这是全有或全无：接管合同就得把座位全开着。
  官方 ui-layout 一禁用，`ctx.layout` 与 theme presenter 也一并由本插件提供。
- **官方 ui-sidebar / ui-conversation 行保持启用**：它们照常注册进 `sidebar` /
  `conversation`（priority 0），DeepBuddy 的占用者以 `priority: -1` 压在下面渲染
  （single slot 最低者渲染）——官方表面不渲染但服务全部存活。
- **开放面已点亮**：`shell.overlay` 里的生态插件（工作区抽屉等）在 DeepBuddy 界面里
  正常出现并可用；`details` 列常闭但子树保持挂载，宽度由
  `ctx.layout.openDetails/closeDetails` 驱动。
- 卸载插件即释放全部注册与那条 disable，官方页面与其全部插件表面恢复。
- 样式全部圈在 `.dbdy` 根类下（自有 `--db-*` tokens）；落在开放面里的生态内容消费
  官方 `--dsw-alias-*`，两套 token 并存。
- Electron 内（UA 含 Electron）模拟红绿灯替换为等宽占位，由壳的 hiddenInset 原生
  控件补位；每列状态栏为窗口拖拽区，控件用 `NO_DRAG` 退出。

## 数据面

- 直接注入 `ctx.sessions` / `ctx.workspaces`（0.1.2 起由
  `dsh-api-session-controller` / `dsh-api-workspace-controller` 提供），类型从
  那些服务面派生（`src/client/dsh/adapter.ts`），抗 harness 版本漂移。
- 文件树/文件读取走本插件 host 半部自持的 `deepbuddyFiles/listDirectory|readFile`
  Typert Remote 端点（host：`src/host.js`，session 围栏 + sessionPersistence 回退；
  client 线：`src/client/dsh/files.ts`，含 session 水合重试）。
- Agent 预设（模式）走 apiproxy 的 `agentPresets` 面 + 设置字段；roster 的投影与
  写保护（busy / staged / error）在共享 `PresetPlane`（`src/client/dsh/presets.ts`）。
- `prompt` 非乐观更新：消息经事件回放落进快照；运行中发送即 steer 插话。

## 已知边界

- 检查器当前只有文件视图；浏览器、运行概览、源代码管理为演示数据，未接入。
- 权限三档、模型选择为 UI 占位，不影响真实会话（权限真面随 approvals 工作接入）。
- 窗口 resize 不重钳制手动拖出的面板宽度（与设计原型行为一致）。

## 安装

```sh
cd /path/to/deepbuddy
dsh plugin --profile deepbuddy add ./plugins/deepbuddy
dsh --profile deepbuddy web --port 3081
```

源码 checkout 用 `pnpm dsh ...`。卸载：`dsh plugin --profile deepbuddy remove dsh-plugin-deepbuddy`（官方 shell 立即还原）。

## 开发

```sh
pnpm --filter dsh-plugin-deepbuddy build       # lib/index.js + lib/client.js
pnpm --filter dsh-plugin-deepbuddy test        # 构建 + 契约/几何测试
pnpm --filter dsh-plugin-deepbuddy typecheck
```

桌面壳见 `apps/desktop/`（Electron，加载本地 `dsh web`）。
