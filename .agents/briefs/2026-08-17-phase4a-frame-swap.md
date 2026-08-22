# 任务：P4a frame 置换——点亮 shell.overlay 与工作区抽屉（开放面第一步）

先读 `ARCHITECTURE.md`（宪章：三环模型、开放面/保留面、R1–R5），本任务是其 P4a。
目标一句话：DeepBuddy 从「root shadow 不渲染任何官方插槽」升级为「接管 ui-layout 的
frame 合同并渲染四个子槽」——悬浮层与工作区抽屉生态即刻可用，创造模式自造的
UI 插件从此看得见。

## 已核实的机制事实（不要重新调研，直接用）

1. **置换方式（R1）**：`plugins/deepbuddy/cordis.patch.yml` 顶层数组加一条
   `- id: ui-layout\n  disabled: true`（保留现有 insert 条目）。bundle 层在
   dsh-web-app 之后应用，disable 生效；卸载本插件即还原官方。
2. **children 声明表（R2）**：root 注册必须带官方同款四子槽（来源
   `deepseek-harness/packages/client/ui-layout/src/client/index.ts:120`，只读参考）：
   ```ts
   children: {
     'sidebar':       { kind: 'single', scope: 'root' },
     'conversation':  { kind: 'single', scope: 'session-maybe' },
     'details':       { kind: 'single', scope: 'session' },
     'shell.overlay': { kind: 'list',   scope: 'root' },
   }
   ```
   类型来自 ui-layout 的 SlotMap merge：devDeps 加回
   `@deepseek-ai/dsh-client-ui-layout@0.1.0-rc.6` 并 type-only import
   `import type {} from '@deepseek-ai/dsh-client-ui-layout/client'`（值导入禁止，purity 规则）。
   RendersCheck 约束：声明了的子槽，组件**必须**都 renderSlot 出来。
3. **ctx.layout 顶替**：官方 ui-sidebar（inject 含 'layout'）与 ui-conversation
   都直接 `slots.register` 占用 'sidebar'/'conversation'，但它们的 apply **等待
   layout 服务**——所以 deepbuddy 在自己的 apply 里 `ctx.reflect.provide('layout', …)`
   + 声明 children，顺序天然有保障。ILayout 合同只有三个方法
   （type-only import 自 ui-layout/client）：`toggleSidebar / openDetails / closeDetails`，
   实现直接委托给我们自己的状态控制器，**不需要**官方那套 framework store/inject 机制。
4. **占用者优先级**：官方 ui-sidebar/ui-conversation 的占用注册照常发生（priority 0），
   DeepBuddy 自己的侧栏/会话面占用者注册 `priority: -1`——single 槽最低者渲染，
   官方占用者保持注册不渲染（保留面定义行为）。**不要 disable ui-sidebar/ui-conversation
   行**（那是 P4b/P4c）。
5. **theme presenter 顶替**：ui-layout 被禁用后主题不再投影到 DOM。照官方
   `packages/client/ui-layout/src/client/theme-presenter.ts`（约 50 行，只读参考）
   在 deepbuddy 里重实现（purity 禁止值导入）：`html.style.colorScheme`、
   `body[data-ds-dark-theme]`、active.tokens 逐个写 body inline CSS 变量（记录后撤销）、
   一个自有的 `meta[name=theme-color]`；订阅 `ctx.on('theme/change')` + 初始
   `ctx.theme.getTheme()`。inject 需加 'theme'。
6. **官方工作区抽屉**（ui-workspace-shell）走 `slots.inject('shell.overlay', …)` 等声明，
   我们声明+渲染后它自动出现（右缘书签 + 抽屉 + 其中的 workspace.* 座位，含终端座位）。

## 实现方案（外科手术，组件内部不动）

当前 `AppFrame.tsx` 的 `DeepBuddyFrame` class 同时是状态所有者与三栏渲染者。P4a 重构：

- **状态所有者上移**：把 DeepBuddyFrame 的 state + 动作原样搬进插件级
  `FrameController`（沿用现有订阅风格：`getSnapshot/subscribe` 或简单 listener set；
  逻辑一行不改，只换宿主）。`Dsh` wire 归它持有。
- **root 占用者 = DeepBuddy chrome**：注册进 'root'（带上面的 children 表）。渲染
  DeepBuddy 自己的网格几何（geometry.ts 不动）：
  `[renderSlot('sidebar', {collapsed, width}) 列 | renderSlot('conversation', {}) 列 |
  DeepBuddy 工作区面板列（现 WorkspacePanel，chrome 内部渲染，不走槽） |
  details 列 | overlay 层 renderSlot('shell.overlay', {})]` + 现有拖拽/红绿灯/标题拖区。
  - `sidebar` 槽 owner props：`{collapsed: boolean; width: number}`
    （SidebarOwnerProps，type-only 自 ui-layout/client）。
  - `details` 列默认宽 0、**子树保持挂载**（官方语义），宽度由 ctx.layout
    openDetails/closeDetails 驱动（P4a 阶段没人调用它，列常闭——机制就位即可）。
- **DeepBuddy 侧栏/会话面变成占用者**：同一插件里
  `ctx.slots.register({name:'sidebar', priority:-1}, DbdySidebarRoot)` 与
  `ctx.slots.register({name:'conversation', priority:-1}, DbdyConversationRoot)`；
  两个 Root 组件订阅 FrameController，把现有 `Sidebar.tsx` / `Conversation.tsx`
  以原 props 渲染（组件内部零改动）。
- **index.tsx** 顺序：provide layout → theme presenter effect → styles →
  root 注册（children）→ 两个占用者注册。全部挂 ctx.effect。
- 测试更新：root 注册带四子槽断言、layout 服务提供断言、占用者 priority -1 断言；
  原有断言维持。

## 验收（全部要真机证据）

1. build / test / typecheck 绿。
2. 重启 3081（`DSH=/Users/byron/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh;
   "$DSH" --profile deepbuddy --port 3081`）：DeepBuddy 界面与置换前视觉一致
   （侧栏/会话/工作区面板/设置全在），**右缘出现官方工作区抽屉书签**，
   打开抽屉、里面文件树可用——shell.overlay 生态点亮的直接证据，截图。
3. **创造模式终端案例**（宪章 P4a 验收案例）：浏览器里新建任务 → 模式 chip 选
   「创造模式」→ 让它「给 DeepBuddy 写一个最小终端插件：client 半部注册进
   workspace.terminal 或 shell.overlay，能输入命令并显示输出」→ 让它当场挂载
   （创造模式自带运行时挂载工具）→ 界面上出现终端 → 跑 `echo hello` 截图。
   若模型/挂载链路不通：记录确切卡点，改用等价验证——你手写同样的最小终端插件
   （新目录 `plugins/terminal-probe/`，可后删）`dsh plugin --profile deepbuddy add`
   后重启验证 UI 面可用，创造模式全链路列为遗留。
4. `UPGRADE.md` 升级规矩里补一条：「官方升级新增插槽必须先按宪章定级
   （开放/保留）再放行版本」。

## 硬约束

- deepseek-harness 与官方包零修改（只读参考）；dsh-plugins 仓不动。
- v2 视觉不回退；组件内部（Sidebar/Conversation/WorkspacePanel/SettingsDialog）零改动，
  只动状态宿主与注册结构。
- 不 git commit。
- 汇报写 `.agents/handoffs/2026-08-17-phase4a-frame-swap.md`（结论先行、命令+实际输出、
  截图路径、与 brief 偏差、遗留）。
