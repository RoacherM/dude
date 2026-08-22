# DeepBuddy 方案：layout 内核 + 自迭代长出核心插件

- 日期 / agent：2026-08-18 / claude
- 一句话：**手写的只有一个 layout 插件**——它拥有骨架几何、设计系统和座位合同；
  侧栏内容、会话面、Dock 面板、设置页、命令面板这些「核心插件」由 dsh 自己在
  创造模式里长出来，验收后收编进发行版。
- 设计规范：`design/synara/design_handoff_dsh_desktop/`（高保真，数值即最终值）
- 前置纠偏：[[2026-08-18-layout-kernel-not-monolith]]

## 0. 为什么这个思路成立（三条机制事实，均已核实）

| # | 事实 | 出处 | 它解决什么 |
|---|---|---|---|
| 1 | 子槽声明可携带 `inject` 面：「父注册的 child 声明提供，每个注册条目都收到绑定好的组件面」 | `dsh-client-ui-slots/lib/types/index.d.ts:96` `SlotEntryDef.inject` | 客户端 bundle 只允许 external 平台模块（契约测试锁着），座位插件**没法** import 我们的组件库——注入面是唯一合法通道 |
| 2 | `ctx.dynamicCordisRunner: CordisRunnerFace`，含 `approve(requestId, approveFutureVersions)` / `decline` / `run` / `stop` / `remove` | `dsh-cordis-client-runner/lib/types/client/index.d.ts:96` | 自绘审批面**不需要** P4b/P4c。P4a 结论「创造模式卡在审批，因为控件坐在 `tool.call.toolview` / `sidebar.footer.action`」有第三条路 |
| 3 | 座位有四种 kind（`single`/`list`/`keyed`/`chain`）与三种 scope（`root`/`session-maybe`/`session`） | 同上 `:72,74` | `dbdy.*` 合同可以精确表达「主列视图按 id 分派」「Dock 面板按 id 分派」「导航项是有序列表」 |

事实 2 是整个方案的钥匙：**没有审批面，「让 dsh 自己写插件」就是空话**——
P4a 已经证明模型能写出双半部插件并走完挂载流程，唯独停在没有可点的授权控件。

## 1. 分层：谁手写，谁自迭代

```
┌── 手写（发行版 UI 内核，一个包）──────────────────────────┐
│ deepbuddy-layout                                          │
│  · 骨架几何：52px 每列顶栏 / 268 侧栏 / Dock 30–70%        │
│  · 设计系统：token（CSS 变量）+ 组件库（经注入面下发）      │
│  · 座位合同：dbdy.* 声明 + 渲染                            │
│  · frame 合同：root + 官方四子槽（P4a 成果，原样保留）      │
│  · 主题投影：钉 dark                                       │
└───────────────────────────────────────────────────────────┘
        ↑ 座位 + 注入面（唯一 API）
┌── 手写但只是搬家（现有代码换个包壳）─────────────────────┐
│ deepbuddy-chat / -sidebar / -explorer                     │
│ deepbuddy-settings-modes / -settings-plugins              │
│ deepbuddy-approvals  ← 唯一真正新写的，闭环的钥匙          │
└───────────────────────────────────────────────────────────┘
        ↑ 同样的座位 + 注入面
┌── dsh 自迭代产出（创造模式写 → 验收 → 收编）─────────────┐
│ browser / terminal / palette(⌘K) / trajectory             │
│ settings-models / kanban / pull-requests / automations    │
└───────────────────────────────────────────────────────────┘
```

**判据**：一个功能进不进 layout，看它是否**决定其他东西的位置**。
决定位置的（列宽、顶栏对齐、折叠、最大化、浮层层序）归 layout；
在框定位置里画画的，一律是座位插件。这就是 I4 布局主权铁律的执行形态。

## 2. 座位合同 `dbdy.*`

只声明马上要填的——「未定级不声明」，与 `UPGRADE.md` 的硬规矩同源。

### 第一批（M1 就位，seed 插件即刻填充）

| 座位 | kind | scope | 填充物 | 首批占用者 |
|---|---|---|---|---|
| `dbdy.main.view` | keyed | session-maybe | 主列视图，按 id 分派 | `chat`（其余键留给自迭代） |
| `dbdy.sidebar.nav` | list | root | 导航项（31px 行、圆角 10、选中白 7%） | 新建会话 / 视图入口 |
| `dbdy.sidebar.section` | list | root | 侧栏分组（项目、会话列表） | 会话列表 + 工作空间 |
| `dbdy.sidebar.footer` | list | root | 底部动作 | 设置入口、帮助 |
| `dbdy.dock.pane` | keyed | root | Dock 分段页 | `explorer`（browser/terminal 留给自迭代） |
| `dbdy.settings.page` | keyed | root | 设置左栏页 | `modes` / `plugins` |
| `dbdy.composer.control` | list | session-maybe | composer 控件条按钮 | 权限、模型、附件、语音 |
| `dbdy.modal` | list | root | 受控模态（审批、破坏性确认） | `approvals` |

### 第二批（M3 之后按需）

`dbdy.topbar.action`（主列顶栏右侧：Trajectory 切换等）、
`dbdy.composer.context`（composer 第三条：工作空间 · 环境 · 分支 · 临时）、
`dbdy.palette.source`（⌘K 条目来源）。

### 注入面（座位插件能拿到的全部 API）

```ts
interface DbdySeat {
  ui: {            // 组件库：COMPONENTS.md 逐项对应，绑定好 token
    Button; IconButton; TextButton; Input; Select; Switch;
    Badge; StatusPill; Card; Popover; Dialog; EmptyState;
    Tabs;          // 下划线式与分段式，两种形态不得混用同一层级
    SettingRow; Dot; Mono;
  }
  layout: {        // 布局动作——只有动词，没有几何数值
    openDock(paneId): void; closeDock(): void; toggleDock(): void;
    openSettings(pageId): void; closeSettings(): void;
    setMainView(id): void;
    openModal(id): void; closeModal(id): void;
  }
  hooks: { layout: SnapshotStore<LayoutState> }   // 只读：当前视图/开合/尺寸
}
```

**座位插件拿不到几何数值，只能拿动词**——这是布局主权在类型层的执行：
插件可以请求「打开 Dock」，不能决定 Dock 多宽、在哪一侧。

设计 token 走另一条路：layout 装 `<style>`，插件消费 `var(--db-*)` 与
`.dbdy-hv-*` 类。**视觉一致性由此成为机制而非自觉**——插件想画一个不在
体系里的颜色，得自己硬编码十六进制，代码审查一眼可见。

## 3. 迁移路线（R4：一次一步，每步界面完整可用）

| 步 | 动作 | 验证方式 |
|---|---|---|
| **M1** 骨架就位 ✅ 2026-08-18 | 在**现有** `plugins/deepbuddy` 内落 token/kit/几何，按规范重写四视图；把现有 Sidebar/Chat/Dock/Settings 内容改为经 `dbdy.*` 座位渲染（同包注册，但走座位） | `pnpm build/test/typecheck` 全绿（16 条契约测试）；3081 真机截图 `reports/m1-kernel/`；契约测试新增座位 kind/scope 逐条断言 → 见 [[2026-08-18-m1-layout-kernel]] |
| **M2** 拆包 | 逐个把座位占用者搬进 `plugins/deepbuddy-*`，一次一个，**行为零 diff** | 搬一个跑一次冒烟 + 截图与 M1 对比无差异；bundle 无跨插件 require |
| **M3** 点亮闭环 | 新写 `deepbuddy-approvals`：消费 `ctx.dynamicCordisRunner`，审批卡坐进 `dbdy.modal` | 重跑 P4a 那条 prompt：创造模式写插件 → 界面上审批 → 挂载 → 出现在 `dbdy.dock.pane`，端到端闭环 |
| **M4** 自迭代 | browser / terminal / ⌘K / trajectory / settings-models / kanban / PR / automations 全部由创造模式产出 | 每个插件一份验收单：截图 + 座位断言 + bundle 纯净 + 无几何硬编码 |

M1 里**删除**：`mock.ts`（演示数据全废）、`WorkspacePanel.tsx`（活动栏被分段页取代）、
`SettingsDialog.tsx`（弹窗 → 整窗）。约 2900 行删改，约 1200 行数据面代码原样留下。

## 4. 自迭代 SOP（M3 之后每个新功能都走这条）

```
创造模式会话
  ├─ 给它三份上下文：座位合同表 / 注入面 d.ts / 一个已收编插件当范例
  ├─ 它写双半部插件 → cordis_run → 界面弹审批 → 批准 → 热挂载
  ├─ 立刻在座位里可见可用（应用环，可卸）
  └─ 验收（fable 或人工）
        ├─ 不过 → 同一会话里让它改
        └─ 过  → 收编：移入 profile 固定段 + 宪章可变性表记一行 → 系统环，随发版走
```

配套要建的两样（M3 一并做）：
- `plugins/_template/`：座位插件模板（package.json 的 `dsh.client` 声明、
  build.mjs、契约测试骨架）——创造模式照抄，不用现推
- layout 包导出 `./client` 的 **type-only** 入口：座位插件 devDependency 引用注入面类型，
  与我们现在 type-only 引用 `ui-layout` 是同一手法

## 4.5 原子化划分（拍板后的最终合同，取代第 2 节的初稿）

用户定的调子：**第一个插件就是 layout；模块边界从 `design/synara` 的交互设计里提炼，
但设计稿的界面划分不等于插件划分**。过完交互设计，三处设计稿切得不够原子：

| 设计稿 | 更原子的切法 | 理由 |
|---|---|---|
| Explorer / Browser / Terminal 各自带多标签 | 多标签上提为 **Dock 通用能力**（注入面给 `tabs` 动词），面板只给「一个标签的内容」 | 同一个标签栏抄三遍；且标签的几何本就归 layout |
| 侧栏硬编码四个导航项 | **导航项跟着视图插件走**，视图插件自带它那一行 | 加一个视图 = 装一个插件，侧栏不需要知道有谁 |
| Trajectory 与 Kanban/PR 并列为「其他视图」 | Trajectory 是 **chat 的正文区替换**，不是主视图 | 规范写明它「占据顶栏与组合框之间」——共享顶栏与 composer，Kanban 不共享 |

### layout 声明并渲染（7 个）

| 座位 | kind | scope | 填充物 | 开放面 |
|---|---|---|---|---|
| `dbdy.main.view` | keyed | session-maybe | 主视图：`chat` / `kanban` / `pull-requests` / `automations` | 系统环 |
| `dbdy.sidebar.nav` | list | root | 导航项（视图插件自带） | 系统环 |
| `dbdy.sidebar.section` | list | root | 侧栏分组（会话列表、项目） | 系统环 |
| `dbdy.dock.pane` | keyed | root | Dock 分段页 | **应用环开放** |
| `dbdy.settings.page` | keyed | root | 设置左栏页 | **应用环开放** |
| `dbdy.palette.source` | list | root | ⌘K 条目来源 | 系统环 |
| `dbdy.modal` | list | root | 受控模态（审批、破坏性确认） | 系统环 |

### chat 插件作为二级平台再声明（3 个）

| 座位 | kind | scope | 填充物 |
|---|---|---|---|
| `dbdy.chat.body` | keyed | session | 正文区：`stream` / `trajectory` |
| `dbdy.composer.control` | list | session-maybe | 控件条按钮（权限 / 模型 / 附件 / 语音） |
| `dbdy.composer.context` | list | session-maybe | 上下文条（工作空间 · 环境 · 分支 · 临时） |

嵌套声明是官方同款结构（ui-conversation 就在 `conversation` 里再声明 composer/input 子座位），
不是新机制。

### layout 拥有的 chrome（不可插）

窗口盒与交通灯预留、列几何（侧栏折叠 / Dock 拖拽与最大化 / details 列）、
**每列 52px 顶栏的容器**、Dock 的**分段页与标签栏**、浮层规约与 z 层序、
模态层、⌘K **壳**、设置**整窗壳**（左栏 268 + 内容 820）、token 与组件库、主题投影。

判据始终是「它是否决定其他东西的位置」。

### 拍板结论

1. **seed = layout 一个包**。现有 chat / sidebar / explorer / 两个设置页
   先作为**临时内部占用者**接在座位上（同包内），保证界面全程可用，M2 再逐个剥离成独立包。
2. **Dock 面板各一个包**（可单独卸载、单独收编）。
3. **第一波只开 `dbdy.dock.pane` 与 `dbdy.settings.page`** 给应用环，其余系统环内部。

## 5. 需要你拍板的三件事（已拍板，见 4.5）

1. **手写 seed 集合到哪一档**——我建议 7 个包（layout + chat + sidebar + explorer +
   settings-modes + settings-plugins + approvals），其中 5 个是纯搬家。
   再少（比如只手写 layout + approvals）产品在 M3 前不可用；再多就侵占了自迭代的地盘。
2. **Dock 面板的分包粒度**——explorer / browser / terminal 各一个包（可单独卸载、
   单独收编），还是一个 `deepbuddy-dock` 包带三个座位（少 3 份构建配置）。我倾向各一包，
   因为收编是逐个决策。
3. **`dbdy.*` 是否对应用环开放**——我建议第一波只开 `dbdy.dock.pane` 与
   `dbdy.settings.page` 两个（原型里画的 "Mount a plugin panel" 就是前者），
   其余标「系统环内部」。侧栏与 composer 一旦开放，第三方就能改变主导航的信息架构。

## 6. 风险与未决

- **注入面一旦发布就难改**：座位插件都绑在上面。缓解——第一批只放 COMPONENTS.md
  已定稿的组件，动词只放 4 组；扩展走加法。
- **创造模式产出的插件质量**：靠模板 + 契约测试 + 验收单，不靠它自觉。
  「无几何硬编码」这条要写成可脚本检查的断言（bundle 里不得出现 `position: fixed`、
  `z-index`、`width: <数值>px` 之类的布局声明）。
- **`dbdy.*` 座位与官方开放面的关系**：两套并存。官方座位（`tool.call.toolview`、
  `settings.section` 等）仍按宪章在 P4b–P4d 逐个点亮，`dbdy.*` 是发行版自有合同。
  两者**不互相替代**——生态插件瞄官方座位，发行版功能坐 `dbdy.*`。
- **未核实**：`chain` kind 的语义（本方案没用到）；`keyed` 座位在没有任何注册时
  `renderSlot` 的返回（空态由 layout 兜，需实测确认不是抛错）。
