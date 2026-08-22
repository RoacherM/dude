# wave7 主界面按官方 DSH 设计语言重做 handoff

- 日期 / agent：2026-08-23 / claude
- 目标：侧栏重做、空白 hero、composer chrome 按官方 DSH 设计语言重做；方向修正（用户拍板）——
  设置与 composer chrome 复活官方实现，不自己写。
- git 基线：`292b76e`（wave6 provider 已合入）。**未 commit**。

## 核心架构变化：复活官方槽（方向修正 3A/3B）

用户拍板方向修正：设置与 composer chrome **不自己写，复活官方实现**。调研后的机制结论：

- **槽系统要求每槽有且仅有一个声明者**（ui-slots `register` 对 undeclared slot 抛错）；
  `slots.inject` 会**延迟**到声明者出现才执行（runtime per-key declaration controller 等待
  `spec !== undefined`）。
- ui-layout / ui-sidebar / ui-conversation 三行被禁用后，它们**声明的子槽随之消失**，
  但官方 registrant（settings-general / model-selection / attachment）仍在 manifest 里、
  `slots.inject` 入驻等待。DeepBuddy 只需**声明并渲染**这些槽，官方整套立即复活。
- 于是采用与 wave6「影子继承合同」完全一致的机制：**DeepBuddy 成为这些槽的声明者**。

### 3A 设置复活（已完成，浏览器实测）

- `dsh/adapter.ts` 新增 `SIDEBAR_SLOT_MAP`（`sidebar.settings` single/root）。
- `App.tsx` 的 `sidebar` 注册增 `children: SIDEBAR_SLOT_MAP`；`DeepBuddySidebar` 收
  `renderSlot` 并在底部渲染 `renderSlot('sidebar.settings', { wide: true })`。
- 官方 `settings-general` 注入 `sidebar.settings`，注册 `SettingsRoot`，声明并渲染
  `settings.trigger/header/action/close/section/onboarding` 子槽；settings-models /
  settings-plugins / agent-preset 经 `settings.section` 挂载。
- **实测**：点侧栏底部「Settings」→ 官方模态打开，导航 = Settings / General / Models /
  Plugins / Agent presets；内容含 Permission（Full access 默认）/ Language / Appearance。
- **删除自研**：`features/settings/` 全部（SettingsApp / SettingsDialog / ModelsPage /
  ModesPage / PluginsPage / store / index）；`dsh/models.ts`（ModelsWire/ModelsPlane 全删）；
  `KIT.Dialog`（删接口 + 实现 + KIT 实例 + openPopoverCount 机制，现 Kit 无使用方）；
  layout-store 的 `settingsOpen` / `openSettings` / `closeSettings`；⌘, 快捷键；
  `dsh.models` wire & `createModelsWire`；`models`/`settings` 从 AppDeps 移除。
- **能力确认覆盖**：官方 Agent presets 分区覆盖自研 ModesPage 的模式增删；官方 Models
  分区覆盖自研 ModelsPage 的 provider/模型/默认模型/凭据；官方 Plugins 分区覆盖
  selfbuilt PluginsPage。缺能力的部分在「未完成」节列出。

### 3B composer chrome 复活（已完成，浏览器实测）

- `dsh/adapter.ts` 新增 `CONVERSATION_INPUT_SLOT_MAP`：
  `conversation.input.attachments`（session-maybe）/ `.plan`（session）/ `.model`（session）。
- `App.tsx` 的 `conversation` 注册增 `children`；`DeepBuddyMain` 收 `renderSlot` 传给
  `ChatView` → `Composer`。
- **官方模型选择器**（ref 14 控件本尊）经 `conversation.input.model` 复活：composer 只传
  `{ locked }`，官方 `ModelSelect` 自带 Model → Effort 两级面板，经 `sessions.selectModel`
  应用（含中途切换）。**实测**：点击「DeepSeek-V4-Pro Max」→ 两级面板
  「Model → DeepSeek-V4-Pro / Effort → Max」。
- **官方附件/计划槽**：`conversation.input.attachments` / `.plan` 声明并渲染。附件槽传空
  `attachments: []` + no-op 回调（官方 rail 无图时渲染空，符合「renders nothing while empty」）。
- **权限档自研**（用户批准「复活官方槽 + 自研权限档」）：查证官方 `/permission` **不是槽**，
  而是 ui-conversation composer 内部把 command 渲染成 PermissionSelect——ui-conversation 禁用后
  无法随槽复活。改为自研 `PermissionChip`：读 `session.projections.faceOf('permissions')`
  （官方权限投影），写回 `session.command('/permission <value>')`。盾牌 icon + 三档
  （read-only / workspace-write / danger-full-access）+ 勾选态。**实测**：composer 左侧显示
  「danger-full-access」，点击弹出三档菜单。`custom` 选项过滤（display-only）。
- **删除自研 ModelChip**（官方槽接管）；`+` 占位按方向修正删除（官方 attachments 槽接管）。

## 1. 侧栏重做（ref 10，已完成）

- 品牌行保留（DeepBuddy + 红绿灯 + 折叠开关）。
- 品牌行下**全宽「新建任务」按钮**（边框卡片 `dbdy-hv-1`，替换原「对话」行）。
- 「工作空间」区头右侧两个 icon：搜索（toggle 搜索框）+ 添加工作空间（`workspaces.pickDirectory`）。
- 会话按工作空间分组：工作空间行（文件夹 icon + 名称，可折叠）→ 缩进会话行，每组默认最多
  5 条 + 「显示更多会话（N）」展开行；无所属空间的会话归「未分组」。当前会话所在组默认展开。
- 底部官方「Settings」触发行保留。

## 2. 空白/new-task hero（ref 10/11/12，已完成）

- 居中 hero：**DeepBuddy** 品牌名 + slogan「向着未知出发，把每一步都变成脚印。」（对齐
  "Into the Unknown" 气质，未直译）。
- hero 下方、composer 上方：工作空间 chip + 模式 chip 一行居中（移出 composer 内部）。
- composer 占位文案改「描述你想做什么」。

## 验证（全绿）

```sh
pnpm build && pnpm typecheck && pnpm test
# deepbuddy 56 条全绿（重写：shadow-priority 列槽声明、sidebar 设置槽+新建按钮、
#   composer 官方 model/权限投影、permission hide 共 5 条新断言；删除 models wire 5 条 +
#   settings Models 页 + composer ModelChip 共 7 条旧断言）
# terminal-probe 5 条全绿。
```

浏览器实测（puppeteer-core + 端口 3082，1440×900）：侧栏分组（GPT-Image2分享 13 条 / 5 显示 +
8 更多、deepseek-harness 6、未分组 Docs）+ 新建任务 + 工作空间搜索/添加；hero 品牌+slogan+
chips；composer 权限档（三档）+ 官方模型两级面板 + 官方设置模态（Settings/General/Models/
Plugins/Agent presets，Permission=Full access）。控制台零 error、零 slot error。服务已停。

## 关键决策/依据

- **复活官方槽 = 声明 + 渲染子槽**：ui-slots 每槽一个声明者；`slots.inject` 延迟到声明者出现。
  禁用的 ui-sidebar / ui-conversation 是原声明者，DeepBuddy 在其位重新声明并渲染。
- **`_`字段类型约束放宽**：官方 `conversation.input.*` / `sidebar.settings` 的 SlotMap 类型
  merge 不在本插件类型图（plugin node_modules 无 sidebar/conversation/settings 包——这些包
  经 web-app manifest 在运行时加载）。故 `PropsRenderSlots`/`ChildrenDecl` 的 key 约束不接受
  这些槽；用无类型 `RenderSlot = (key, owner) => ReactNode` 作 render 面 + `as unknown as
  ChildrenDecl` 声明 children。DSH ABI 仍只进 `dsh/adapter.ts`。
- **权限档用官方投影机制**：`permissions` 投影是 host 折叠三 knob（preset/sandbox/approval）
  的整值，`faceOf('permissions')` 恒有 face（无值=undefined snapshot）；写回走 `/permission`
  命令（官方唯一写路径）。`custom` 是派生 display-only 态，永不作目标。
- **permission chip 隐藏而非 fake**：无权限服务编排（投影 absent/options 空）时返回 null。
- **模型选择自官方**：`ModelDirectoryResolver` 是 model-selection 的 `ctx.plugin`，独立于我们的
  `dsh.models`；composer 只传 locked。
- 删除纪律：`settings`/`models` 平面、`KIT.Dialog`、layout-store 设置状态、`dsh.models` wire 全部
  删除（新路径无消费方）。

## 未完成 / 下一步

- **附件 `+` 占位**：官方 `conversation.input.attachments` 槽在无图时渲染空（无持久 `+` 按钮）。
  ui-conversation 的 composer-bar `+`（IconPlusOutline16）属于禁用行，无法随槽复活。当前附件
  能力已挂槽（承载 drop/预览），但要一个可见 `+` 入口需完整 input-hub（`conversation.input.for`
  + `addImages`/`draftImages` 合同），本波未做。如需下一步：复活 `conversation.input.for` 服务
  面并接线 `onAddImages`。
- **`⌘,` 打开设置快捷键**已随自研 settings 删除（官方设置触发在侧栏底部）。如需恢复，
  需在 slot 系统外调用官方 SettingsRoot 的打开态——工作量待评估。
- `reports/restructure/` 为既有未跟踪目录，非本波产物。

## 验收补记（claude，2026-08-23）

- **权限档标签修复**（验收中发现并直接修复）：chip 原样显示机器名
  `danger-full-access`。对照官方 ui-conversation 的 `optionLabel`：full-access
  显示产品名「Full access」，其余 kebab 机器名 title-case（`read-only` → Read Only）。
  已在 `Chat.tsx` 加 `permissionLabel()` 复刻官方规则，浏览器实测 chip=「Full access」，
  菜单=Read Only / Workspace Write / Full access（ref 13 一致）。
- **英文「Settings」是 Language 设置**：官方设置 General 有 Language（默认 English）。
  经官方下拉切到「中文」后触发行/模态/模型面板全部中文化（写入 `~/.dsh/settings.yaml`，
  对 3080/3081 同样生效）。非缺陷。
- **重大发现（非本波回归，另开 wave8）**：打开任何冷会话（历史会话）transcript 全空白。
  根因链（浏览器 fiber 探针 + 官方源码确认）：
  1. `session.history` host 端点正常（手动调用返回 292 events）；
  2. 客户端把 events 折叠成 chat/legacy 节点靠 **conversation registry**
     （`conversationEvents`/`conversationViews`，runtime 提供空注册表）；
  3. 注册表里只有 trajectory/goal/deliverables/workflow-run 的定义，**缺全部 chat 定义**
     （message/assistant/tool/command/compaction/retry/turn-error/turn-tail/fallback + `chat` 视图）——
     它们由官方 **ui-conversation 的 `registerConversationNodes(ctx)`** 注册，而该行从未激活
     （wave6 前 pending、wave6 起禁用）；
  4. 实时流靠 host 推帧（partial/runningCalls）显示，turn 结束后同样折叠失败 → 空白。
  已用 git worktree 跑 wave6（292b76e，端口 3090）对照：**同样空白**，证明非 wave7 回归
  （也解释了 wave2 用户报的空白会话——当时只诊断了 corrupt log 和空文件两个个案）。
  证据截图：`reports/restructure/w6-control-cold-session.png`。

## 复测入口

```sh
node_modules/.bin/dsh --profile deepbuddy --port 3082 --no-open   # 浏览器 http://127.0.0.1:3082
pnpm --filter dsh-plugin-deepbuddy build && pnpm --filter dsh-plugin-deepbuddy test
# 设置复活证据：点侧栏底部 Settings → 模态含 General/Models/Plugins/Agent presets
# composer 官方模型证据：点「DeepSeek-V4-Pro Max」→ Model/Effort 两级面板
# 权限档证据：composer 左侧盾牌 + 三档（read-only/workspace-write/danger-full-access）
```
