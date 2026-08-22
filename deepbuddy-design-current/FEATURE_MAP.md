# DeepBuddy v1 功能地图

> 用途：把第一版要做的功能落到明确区域、数据源和状态 Owner。  
> 它是开发计划，不是长期公共 API。

---

## 1. 顶层功能

| 模块 | 区域 | 类型 | 数据 / 能力来源 | 状态 Owner |
|---|---|---|---|---|
| ThreeColumnFrame | 全窗 | Shell | Window / Layout | Layout Store |
| Session List | Sidebar | 普通模块 | DSH Sessions / Workspaces | DSH + 局部筛选状态 |
| Conversation | Workbench | 领域模块 | DSH Session Log / Agent | DSH；草稿归 Conversation |
| Settings | Overlay Dialog | 普通模块 | DSH Settings / Models / Presets | DSH Settings |
| Files | Inspector | 普通 View | DSH Filesystem | Files Provider |
| File Preview | Inspector | 普通 View Instance | DSH Filesystem | Files Provider + View State |
| Terminal | Inspector | 资源 View | DSH Terminal 或 Electron PTY | Terminal Resource Manager |
| Approval / Questions | Veil + Conversation | 流程 UI | DSH Agent / Approval | DSH |
| Dialog / Toast | Veil | Shell 基础设施 | Feature 请求 | Overlay Store |

---

## 2. Sidebar

### 当前内容

```text
状态栏
├── macOS 红绿灯
├── DeepBuddy
└── 左列开关

功能区
├── 「新建任务」全宽主按钮（边框卡片，替换原「对话」行）
├── 「工作空间」区：区头（搜索 + 添加工作空间）、按会话分组的空间行（可折叠）
│   ├── 默认每组最多 5 条会话
│   ├── 多出的收进「显示更多会话」展开行
│   └── 无所属空间的会话归入「未分组」
└── Settings（官方 `sidebar.settings` 槽触发行）
```

### Session List

必须支持：

- 当前 Session；
- 运行状态；
- 最近更新时间；
- 点击打开；
- 新建任务；
- 工作空间分组（每空间默认 5 条 + 「显示更多」）；
- Loading / Empty / Error。

当前不做：

- 动态 Widget 注册；
- 行级统一 Placement；
- 第三方 Sidebar Contribution。
---

## 3. Workbench

### Conversation

优先复用 DSH 官方已有能力：

- Session Log 投影；
- Streaming；
- Conversation Node；
- Tool Call Renderer；
- Approval / User Question；
- Model / Preset；
- Stop / Retry。

DeepBuddy 负责：

- 自己的 Column Chrome；
- 消息与 Composer 的视觉；
- 当前最小动作集；
- DSH 数据适配；
- 与 Sidebar / Inspector 的整体体验。

Conversation 可以使用 DSH 已有的领域 Slot，因为那里已经有真实消费者。不要把这种复杂度推广到 Settings、Files 等普通页面。

默认工作空间：不选文件夹也能直接开聊。存在一个默认工作空间，cwd 为用户主目录（`~`）；
空白页 composer 的工作空间 chip 默认显示「默认空间」（title / 悬浮提示展示实际路径）。
发送时若未显式选择：优先用已存在的主目录 workspace，没有则自动
`workspaces.create({ path: 主目录 })` 再连接。主目录路径从 DSH 侧取（`host.listDirectory` 的
`home`），取不到就用 host 提供的信息（`host.describe` 的 `cwd`），不在客户端硬编码。显式选过
文件夹的行为不变。

### Settings

Settings 是覆盖式设置面板（弹层面板，对齐 DSH web 原生 / WorkBuddy）：

- 从 Sidebar 底部或快捷键打开；
- 不创建独立整窗模式；
- 打开设置不改变主列内容——主列继续显示当前会话；
- 面板内部左侧竖排导航（模型 / 模式 / 插件，结构上允许以后加页），右侧内容区，右上角 × 关闭；
- 居中、占视口大部（宽 min(1200px, 90vw)、高 min(860px, 90vh)）、圆角、遮罩层点击关闭；
- 页面结构先静态写死；
- 第三个独立设置分组出现后，再考虑内部配置数组。

首批设置：

- 模型与 Preset；
- 权限 / Approval 默认值；
- 外观（当前只提供必要开关，不做主题生态）；
- DSH 连接与诊断；
- 更新与版本信息。

---

## 4. Inspector

### Files

第一阶段：

- Workspace File Tree；
- 打开文件；
- 文本只读预览；
- 路径与错误状态；
- 与当前 Session / Workspace 对齐。

第二阶段再考虑：

- 编辑器；
- Diff；
- 搜索；
- 多种 Renderer。

Files 本身先是普通模块，不建立通用 File Viewer 插件协议。

### Terminal

Terminal 是第一个资源型模块。

必须支持：

- 创建多个 Terminal；
- Tab 切换；
- 收起右列仍运行；
- 明确 Kill；
- Resize；
- 退出清理；
- 宿主拒绝或失败时给出可操作错误。

Resource Manager 与 View 分开，但留在 `features/terminal` 内。

### Inspector 实例规则

```text
0 个 View  → Inspector 可关闭
1 个 View  → 标题 + 正文
多个 View  → Tabs + Active 正文
```

关闭后焦点：

```text
优先右邻
→ 无右邻则左邻
→ 最后一个关闭则收起右列
```

右列（停靠栏）与其开关按钮只在打开了一个非空会话（有对话内容或已开始）时可见；
空白 / 新任务页不显示开关，若 dock 已开则自动收起。切回有内容的会话时恢复
用户上次的 dock 开关偏好（layout-store 已有的状态即可，不新增持久化）。

---

## 5. 当前全局动作

| 动作 | 需要快捷键 / 跨模块 | 建议实现 |
|---|---|---|
| 开关左列 | 是 | Shell Command |
| 开关右列 | 是 | Shell Command |
| 新建 Session | 是 | DSH Command Wrapper |
| 打开 Settings | 是 | Shell Command |
| 发送消息 | 主要局部 | Conversation Action |
| 停止 Agent | 是 | DSH Command Wrapper |
| 打开文件 | 跨 Conversation / Files | Shared Command |
| 关闭当前 Inspector View | 可快捷键 | Shell Command |
| 复制消息 | 否 | 局部事件 |
| 重试某轮 | 绑定具体消息 | Conversation 局部事件 / DSH 调用 |
| 展开文件夹 | 否 | Files 局部事件 |

当前不建设自动 Command Palette。等全局命令数量和搜索需求真实增长后再做。

---

## 6. DSH 能力落点

| DSH 能力 | DeepBuddy v1 落点 |
|---|---|
| Sessions / Workspaces | Sidebar + Conversation |
| Agent 状态 | Workbench 状态栏 + Composer |
| Models / Presets | Composer + Settings |
| Approval | Dialog / Composer 接管 / Conversation 行 |
| User Questions | Dialog 或 Conversation 内联流程 |
| Tool Calls | Conversation 内 Tool Cards |
| Tool Details | Conversation 或 Inspector，按官方数据能力决定 |
| Filesystem | Files Inspector + open-file command |
| Terminal | Terminal Inspector |
| Trajectory | Conversation 内可选 View；有真实需求再暴露 |
| Plugin Settings | 当前不做通用插件市场；第一方设置静态组合 |
| Theme | 使用 DeepBuddy Token，不承诺官方 UI 主题兼容 |

若上游新增能力无法落入当前模块，先记录到升级计划，不为了它立刻建立通用 UI 扩展系统。

---

## 7. 开发里程碑

### M0：壳

- ThreeColumnFrame；
- ColumnFrame；
- Layout Store；
- 四态与响应式；
- KIT / Token；
- Adapter 骨架。

### M1：核心对话

- Session List；
- New Session；
- Conversation；
- Streaming；
- 发送 / 停止；
- 模型 / 权限档；
- 基础 Tool Cards。

### M2：设置

- Settings 作为普通 Workbench 页面；
- 模型 / Preset；
- 连接诊断；
- 必要偏好。

### M3：文件

- File Tree；
- 打开文件；
- 多文件 View；
- 错误与路径处理。

### M4：终端

- Terminal Resource Manager；
- 多实例；
- Tab 保活；
- Resize / Kill / 清理。

### M5：流程完整性

- Approval；
- User Questions；
- DSH 失败恢复；
- Focus / Accessibility；
- 性能与截图回归。

---

## 8. v1 明确不做

- UI 插件 SDK；
- UI 插件市场；
- 运行时热装面板；
- 用户自定义布局；
- 自由浮窗；
- 任意 Webview；
- 第三方主题；
- 为两个实例提前建立通用 Registry；
- 为所有局部动作建立 Command / Placement / `when`。

---

## 9. 完成定义

v1 可以被认为架构跑通，当：

- 用户能稳定创建、打开和切换 Session；
- Conversation 使用 DSH 真实数据完成一次完整 Agent 流程；
- Settings 在主列打开且不改变左右列；
- Files 能打开多个文件 View；
- Terminal 在切 Tab 和收右列后继续运行；
- 四种布局状态和窄窗口都可用；
- 删除任一普通 Feature 不需要修改其他 Feature 内部实现；
- 尚未为不存在的外部 UI 插件作者冻结接口。
