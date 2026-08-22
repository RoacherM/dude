# DeepBuddy 架构

> 状态：现行  
> 架构形态：**模块化单体 Electron Client**  
> 核心原则：**能力属于 DSH，界面属于 DeepBuddy；实现保持可重构，不提前承诺可插拔。**

---

## 1. 产品定位

DeepBuddy 是 DeepSeek Harness 的桌面发行版，不是另一套 Agent Core，也不是通用 UI 插件平台。

DeepBuddy 直接复用 DSH 的领域能力：

- Session 与 Workspace；
- Agent 与 Agent Loop；
- 模型、Preset 与凭据；
- Tool 调用与结果；
- 文件系统、终端、沙箱与审批；
- 持久日志、恢复、Fork 与运行状态。

DeepBuddy 自己负责：

- Electron 窗口与桌面集成；
- 三列两区布局；
- 第一方功能模块；
- 统一设计语言；
- 将 DSH 数据投影为清晰的桌面体验。

承诺的单位是**能力语义**，不是 DSH 官方 UI 的组件结构或 Slot 名称。

---

## 2. 当前架构图

```text
Electron Main
├── 窗口生命周期
├── DSH Host 启停
├── 原生菜单 / 通知 / 更新
└── 受控 IPC

Preload
└── 极窄的 Desktop Bridge

Renderer
├── DSH Adapter
│   ├── sessions
│   ├── agents
│   ├── models / presets
│   ├── tools / approvals
│   ├── files
│   └── terminals
│
├── ThreeColumnFrame
│   ├── SidebarColumn
│   ├── WorkbenchColumn
│   └── InspectorColumn
│
├── Feature Modules
│   ├── sessions
│   ├── conversation
│   ├── settings
│   ├── files
│   └── terminal
│
└── UI Foundation
    ├── KIT
    ├── tokens
    ├── icons
    └── dialogs / toast
```

---

## 3. 组合方式：静态目录，而不是动态注册表

v1 的第一方 UI 使用普通 TypeScript 目录组合：

```ts
// app/catalog.ts
export const WORKBENCH_APPS = [
  ConversationAppDefinition,
  SettingsAppDefinition,
] as const

export const SIDEBAR_SECTIONS = [
  SessionListDefinition,
] as const

export const INSPECTOR_VIEW_TYPES = [
  FilesViewDefinition,
  TerminalViewDefinition,
] as const
```

新增第一方功能的默认流程是：

```text
写一个模块
→ 导出一个薄 Definition
→ 加入一个静态数组
→ 类型检查、测试、重启
```

当前不需要：

- 动态安装；
- Manifest；
- API Version；
- 冲突仲裁；
- 公共 Placement；
- 全局 `when` DSL；
- 运行时 UI 热插拔。

静态数组未来可以替换为 Registry，只要 Definition 保持薄，功能模块无需重写。

---

## 4. DSH 插件与 UI 插件不是同一件事

DSH 的“一切皆插件”继续成立于能力层和运行时层。

DeepBuddy 的第一方 UI 模块可以为了复用以下能力而实现为 Cordis 插件：

- 显式服务依赖；
- 生命周期与 Effect 清理；
- Profile / Bundle 组合；
- 现有 Conversation Node、Tool Renderer 等扩展点。

但必须区分：

```text
实现上通过 Cordis 挂载
≠
产品上承诺公开 UI 插件协议
```

第一方模块可随仓库重构；在出现外部消费者之前，不为它们冻结兼容接口。

---

## 5. 模块边界

### 5.1 Shell

Shell 只负责：

- 三列几何；
- 左右列开关；
- 拖拽与响应式；
- 当前 Workbench 页面；
- Inspector View 实例集合；
- 窗口级对话框与 Toast。

Shell 不处理：

- Session 日志推导；
- Tool Call 配对；
- Terminal 进程；
- 文件读取；
- Settings 业务逻辑。

### 5.2 DSH Adapter

`dsh-adapter` 是 Renderer 唯一理解 DSH 具体 ABI 的位置。

Feature 应依赖稳定 Hook 或 Service：

```ts
useSessions()
useCurrentSession()
useAgentStatus(sessionId)
useModelOptions()
useApprovals(sessionId)
useWorkspaceFiles(workspaceId)
```

禁止每个 Feature 自己解析官方事件或自行维护第二份 Session 状态。

### 5.3 Feature Module

每个 Feature：

- 有独立目录；
- 只从自己的公共入口导出；
- 不深度导入另一个 Feature 的内部文件；
- 拥有自己的局部 UI 状态；
- 通过 Adapter 或明确 Service 获取领域数据；
- 可以被整体删除或替换。

推荐目录：

```text
features/terminal/
├── index.ts
├── TerminalView.tsx
├── terminal-resource-manager.ts
├── types.ts
└── tests/
```

---

## 6. 状态所有权

每份可变状态只有一个 Owner。

| 状态 | Owner |
|---|---|
| 当前 Session / Session 日志 | DSH Session Service |
| Agent 运行状态 | DSH Agent Service |
| 模型与 Preset | DSH / Settings Service |
| 左右列显隐和宽度 | Layout Store |
| 当前 Workbench App | Shell Store |
| Inspector View 实例 | Inspector Store |
| 文件内容与目录 | Files Provider / Cache |
| Terminal 进程 | Terminal Resource Manager |
| Composer 草稿 | Conversation Feature |

组件不直接通知其他组件。数据流应是：

```text
用户动作
  → 调用 Owner
  → Owner 更新 Snapshot
  → 订阅该 Snapshot 的 UI 重绘
```

---

## 7. 普通模块、资源模块、领域 Host

这不是公开插件等级，只是内部实现分类。

### 普通模块

Settings、About、静态预览、普通表单：

```text
挂载组件
→ 使用数据
→ 卸载组件
```

不需要额外资源协议。

### 资源模块

Terminal、Browser、Editor、播放器：

```text
View 生命周期
≠
Resource 生命周期
```

资源管理逻辑留在对应 Feature 内，不推广成所有页面的公共框架。

### 领域 Host

只有需要让多个独立贡献者继续扩展的区域才成为 Host，例如：

- Conversation Node；
- Tool Call Renderer；
- 未来已有三个真实消费者的 Settings 子页；
- 未来 Plugin Studio。

领域 Host 优先复用 DSH 已有 Slot 和 Renderer 契约，不在 DeepBuddy 再造平行系统。

---

## 8. 何时抽象

采用 Rule of Three。

只有出现以下信号之一，才建立新的公共抽象：

1. 第三次为同类功能修改 Shell；
2. 同一种代码结构已在三个独立模块中重复；
3. 出现第一个非核心作者；
4. 功能需要独立安装、卸载或版本升级；
5. 同一能力出现多个 Provider 和多个 Consumer；
6. 当前直接组合已经造成真实测试或维护问题。

在这些信号出现前，允许少量复制和局部特例。它们是设计样本，不是失败。

---

## 9. Electron 边界

- Main 负责主机能力和窗口生命周期。
- Preload 只暴露窄接口。
- Renderer 不直接获得 `fs`、`child_process` 或裸 `ipcRenderer`。
- 文件、终端、通知等原生能力通过 Adapter / Provider 使用。
- Client 模块边界用于维护产品秩序，不替代 Host 侧权限和 DSH 审批。

具体安全实现另随代码落地，但不得以“当前都是自己写的代码”为由打开完整 Node 权限。

---

## 10. 当前非目标

- 面向第三方的 UI 插件 SDK；
- 插件市场；
- 运行时安装任意面板；
- 公共 `declare / register / surface` 协议；
- 全局 Placement 与 `when` DSL；
- 任意 Webview 和自由浮窗；
- 多主题生态；
- 将每一个点击动作命令化；
- 为尚不存在的消费者维护兼容层。

---

## 11. 推荐源码结构

```text
src/
├── main/
├── preload/
└── renderer/
    ├── app/
    │   ├── App.tsx
    │   ├── catalog.ts
    │   └── stores/
    ├── shell/
    │   ├── ThreeColumnFrame.tsx
    │   ├── ColumnFrame.tsx
    │   └── layout-store.ts
    ├── dsh/
    │   ├── adapter.ts
    │   ├── hooks.ts
    │   ├── commands.ts
    │   └── types.ts
    ├── features/
    │   ├── sessions/
    │   ├── conversation/
    │   ├── settings/
    │   ├── files/
    │   └── terminal/
    └── ui/
        ├── kit/
        ├── tokens.ts
        └── icons.tsx
```

---

## 12. 架构验收

当前架构被正确实现时，应满足：

- 删除某个 Feature 不需要改动其他 Feature 内部代码；
- Shell 不包含 Session、File 或 Terminal 业务分支；
- DSH ABI 变化主要收敛在 Adapter；
- Settings、Files 等普通页面没有虚构的插件 Manifest；
- Terminal 的进程不会因为切换 Tab 或收起右列而意外死亡；
- 没有外部消费者时，不为内部接口承诺兼容；
- 新增普通面板的主要工作仍是组件 + 一行静态目录配置。
