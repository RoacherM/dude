# DeepBuddy 架构

> 状态：现行
> 架构形态：**官方优先的轻量增强客户端（Option A: Official-First Thin Client）**
> 核心原则：**官方优先，最小侵入；桌面增强，标准扩展。**

---

## 1. 产品定位

DeepBuddy 是 DeepSeek Harness 的桌面发行版，执行“最小可侵入性”的套壳与增强策略，而非重写一套平行的 UI 框架。

DeepBuddy 直接复用 DSH 的全部官方能力与交互：

- 官方应用布局（`ui-layout`）、官方左侧栏（`ui-sidebar`）与官方右侧栏（dockkit，含 Files 页）；
- 官方会话交互（Conversation 流、Agent Loop、Hero、输入框、模型与 Preset 选择）；
- Tool 调用与结果、权限审批流；
- 持久日志、恢复、Fork 与运行状态；
- 底层文件系统、沙箱与环境能力。

DeepBuddy 只贡献官方没有的两样东西：

- **桌面窗口集成**：一段全局样式表，负责 macOS 交通灯的拖拽避让区和正文字体；
- **品牌**：把 DeepBuddy 的鱼形标记注册进官方 Hero 的 `conversation.hero.brand.mark` 槽。

没有第二套侧栏、没有自绘布局、没有自己的检查器（Inspector）。之前存在的 Terminal /
Browser / Files 预览、三列布局壳、KIT、设计令牌、Preset Plane、Session 围栏、host 侧
`deepbuddyFiles/*` 端点，随官方右栏（dockkit，自带 Files 页）落地而整体删除：这些能力
DSH 官方已经原生提供，继续维护一份平行实现违反官方优先原则。

---

## 2. 现行架构图

```text
Electron Main
├── 窗口生命周期与原生菜单
├── DSH Host 启停
└── 受控 IPC

Preload
└── 极窄的 Desktop Bridge

Renderer
└── DSH Upstream Core & UI（官方全量复用，未做二次包装）
    ├── AppFrame（官方 ui-layout）
    ├── Official Sidebar（工作区 / 会话列表 / 设置入口）
    ├── Official Conversation（会话流 / Agent Loop / Hero / 输入框）
    ├── Official Rightbar（dockkit：Files 等官方页面）
    └── DeepBuddy Plugin（唯一自研代码，两个 Effect）
        ├── 样式表：字体 + 窗口拖拽区域 + Hero 悬停动效
        └── Hero 品牌标记：注册进 conversation.hero.brand.mark
```

---

## 3. 插件结构

插件只有两个客户端模块，没有 Feature 目录、没有静态 Catalog、没有 Shell：

```text
src/client/
├── app/App.tsx        # 入口：inject = ['slots']，调用 mountOfficialServices
├── dsh/adapter.ts      # 唯一理解 DSH ABI 的层：安装样式表 + 注册 Hero 品牌标记
└── ui/
    ├── styles.ts       # 拖拽区域 CSS + Hero 悬停动效
    └── fonts.ts        # Archivo 字体 @font-face + 字体变量覆写
src/host.js              # Host 半部，空实现（只声明 name + 空 apply）
```

新增能力前先确认：官方是否已经原生提供。DeepBuddy 不为了“可能有用”预先搭 Feature
目录、Catalog 或 Registry —— 当前没有第二个、第三个自研 UI 模块，抽象没有意义。

---

## 4. DSH 插件与 UI 插件不是同一件事

DSH 的“一切皆插件”继续成立于能力层和运行时层。`dsh-plugin-deepbuddy` 以 Cordis 插件
形式挂载，是为了拿到生命周期 Effect（挂载即安装、卸载即撤销），不代表 DeepBuddy 对外
承诺一套公开 UI 插件协议。

```text
实现上通过 Cordis 挂载
≠
产品上承诺公开 UI 插件协议
```

---

## 5. DSH ABI 边界

`dsh/adapter.ts` 是唯一理解 DSH slot 注册 ABI（`ctx.slots.inject` / `.register`）的
文件。它做两件事，各自一个独立 `ctx.effect`，卸载互不影响：

- 安装样式表（`ui/styles.ts` 的拖拽区域规则 + `ui/fonts.ts` 的字体覆写）；
- 把 `DeepBuddyBrandMark` 注册进官方 `conversation.hero.brand.mark` 槽（优先级 -1，
  低于官方 fish logo 的优先级 0，因此单一 occupant 的槽渲染 DeepBuddy 的版本）。

不覆写内部私有 ABI，不注入破坏性 CSS 隐藏官方组件；拖拽区域规则通过官方组件暴露的
`data-*` 属性（`data-rightbar-col` / `data-phase` / `data-dockkit-strip` /
`data-rightbar-fullscreen` / `data-dockkit-pane` / `data-conversation-header-corner`）
定位，不依赖 hash 化的 CSS 类名。

---

## 6. 状态所有权

DeepBuddy 不持有任何领域状态或布局状态：

| 状态 | Owner |
|---|---|
| Session / Agent / Model / Preset / 文件 / 布局显隐宽度 | DSH 官方（Session Service /
  Agent Service / ui-layout / dockkit） |
| 样式表是否安装 | `ctx.effect`（插件挂载期间恒为已安装） |
| Hero 品牌标记是否注册 | `ctx.effect`（插件挂载期间恒为已注册） |

没有 Layout Store、没有 Inspector Store、没有 Terminal Resource Manager。这些之前存在
的 Owner 随对应功能一起删除。

---

## 7. 何时抽象

采用 Rule of Three：同一类问题出现第三个真实实例之前，不建立公共框架。当前插件只有
两个客户端模块，远未触发任何抽象信号。若未来新增第二个官方没有的增强能力，先直接实现，
不预先搭 Catalog / Registry / Definition 协议。

---

## 8. Electron 边界

- Main 负责主机能力和窗口生命周期。
- Preload 只暴露窄接口。
- Renderer 不直接获得 `fs`、`child_process` 或裸 `ipcRenderer`。
- 插件不再自带任何 host 侧业务端点（`deepbuddyFiles/*`、`/deepbuddy/media`、
  `/deepbuddy/terminal` 均已删除）；`src/host.js` 是空实现，文件与终端能力完全由官方
  dockkit 提供。
- **配置隔离**：发行版一律以 `DSH_HOME=~/.deepbuddy` 运行（启动器 `scripts/deepbuddy`），
  用户数据（settings / credentials / sessions / storages / profiles/deepbuddy）全部落在
  `~/.deepbuddy`，与官方 `~/.dsh` 自首次迁移时刻起分叉、互不可见。首次运行从 `~/.dsh`
  **复制**（非移动，官方目录只读），`profiles/deepbuddy` 用 `cp -RP` 保留指向本仓库的
  符号链接。

---

## 9. 当前非目标

- 面向第三方的 UI 插件 SDK；
- 插件市场；
- 运行时安装任意面板；
- 公共 `declare / register / surface` 协议；
- 自绘的第二套侧栏、右栏或检查器；
- 任意 Webview 和自由浮窗；
- 多主题生态；
- 为尚不存在的消费者维护兼容层。

---

## 10. 架构验收

当前架构被正确实现时，应满足：

- 官方 `ui-layout` / `ui-sidebar` / `ui-conversation` 全部保持启用，`cordis.patch.yml`
  不出现禁用它们的行；
- `client.js` bundle 不重新声明 `root`、`sidebar`、`main` 或第二份 `layout`；
- 插件卸载后官方界面完整可用，不留下任何遗留状态；
- 两个 Effect（样式表、Hero 品牌标记）各自独立清理；
- 客户端 bundle 里不出现已删除功能的痕迹（xterm、`deepbuddyFiles`、
  `/deepbuddy/terminal` 等）。
