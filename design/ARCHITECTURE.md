# Dude 架构

> 状态：现行
> 架构形态：**官方优先的轻量增强客户端（Option A: Official-First Thin Client）**
> 核心原则：**官方优先，最小侵入；桌面增强，标准扩展。**

---

## 1. 产品定位

Dude 是 DeepSeek Harness 的桌面发行版，执行“最小可侵入性”的套壳与增强策略，而非重写一套平行的 UI 框架。

Dude 直接复用 DSH 的全部官方能力与交互：

- 官方应用布局（`ui-layout`）、官方左侧栏（`ui-sidebar`）与官方右侧栏（dockkit）；
- 官方会话交互（Conversation 流、Agent Loop、Hero、输入框、模型与 Preset 选择）；
- Tool 调用与结果、权限审批流；
- 持久日志、恢复、Fork 与运行状态；
- 底层文件系统、沙箱与环境能力。

Dude 只贡献官方没有的一样东西：**桌面窗口集成**——一段全局样式表，声明窗口拖拽区域，
让左栏顶部避开 macOS 红绿灯，右栏全屏时让出展开的左栏。Hero 的品牌标记也用官方的鲸鱼。

没有第二套侧栏、没有自绘布局、没有自己的检查器（Inspector）。官方缺的能力是能力缺口，
靠升级官方版本补，不自绘平行实现：锁定的 0.1.5-rc.3 官方右栏只有 Files 页，终端和
浏览器由上游 0.1.6 的 `ui-sidebar-terminal` / `ui-sidebar-browser` 提供。已删除的自研
部分见 `FEATURE_MAP.md` §3。

---

## 2. 现行架构图

```text
Electron Main（apps/desktop/main.js）
├── 窗口：hiddenInset、红绿灯位置、底色；removeMenu() 去掉原生菜单
├── 打包版起停 dsh 子进程（profile dude-app）
└── 页面开新窗口的链接交给系统浏览器

Renderer（官方 web 客户端；没有 Preload，没有 IPC）
└── DSH Upstream Core & UI（官方全量复用，未做二次包装）
    ├── AppFrame（官方 ui-layout）
    ├── Official Sidebar（工作区 / 会话列表 / 设置入口）
    ├── Official Conversation（会话流 / Agent Loop / Hero / 输入框）
    ├── Official Rightbar（dockkit：锁定版本只有 Files 页）
    └── Dude Plugin（唯一自研代码，一个 Effect）
        └── 样式表：窗口拖拽区域 + 红绿灯避让
```

---

## 3. 插件结构

插件只有两个客户端模块，没有 Feature 目录、没有静态 Catalog、没有 Shell：

```text
src/client/
├── app/App.tsx        # 入口：调用 mountOfficialServices
├── dsh/adapter.ts      # 唯一接触官方应用的层：安装样式表
└── ui/
    └── styles.ts       # 拖拽区域与红绿灯避让 CSS
src/host.js              # Host 半部，空实现（只声明 name + 空 apply）
```

新增能力前先确认：官方是否已经原生提供。Dude 不为了“可能有用”预先搭 Feature
目录、Catalog 或 Registry —— 当前没有第二个、第三个自研 UI 模块，抽象没有意义。

---

## 4. DSH 插件与 UI 插件不是同一件事

DSH 的“一切皆插件”继续成立于能力层和运行时层。`dsh-plugin-dude` 以 Cordis 插件
形式挂载，是为了拿到生命周期 Effect（挂载即安装、卸载即撤销），不代表 Dude 对外
承诺一套公开 UI 插件协议。

```text
实现上通过 Cordis 挂载
≠
产品上承诺公开 UI 插件协议
```

---

## 5. DSH ABI 边界

`dsh/adapter.ts` 是唯一接触官方应用的文件，只做一件事：在一个 `ctx.effect` 里安装
样式表（`ui/styles.ts`），卸载时移除。Dude 不注册任何 slot，不 `inject` 任何服务。

不覆写内部私有 ABI，不注入破坏性 CSS 隐藏官方组件。样式表通过官方组件暴露的 `data-*`
属性（`data-rightbar-col` / `data-phase` / `data-composer-seat` / `data-dockkit-strip` /
`data-dockkit-pane` / `data-dockkit-cell` / `data-sidebar-collapsed` /
`data-sidebar-right-panel` / `data-sidebar-right-open` / `data-rightbar-fullscreen` /
`data-conversation-header-corner`）和语义元素（`header`）定位，不依赖 hash 化的 CSS
类名；左栏列没有自己的属性，按「含 `[data-rightbar-col]` 的 frame 的第一个 `div`」定位。
它对官方布局只动三处：左栏 `padding-top: 36px`、右栏全屏面板的左缘和最大宽度、收起左栏
时左上 Tab 栏的 `padding-left: 80px`，规则见 `DESIGN_INTENT.md` §2。

---

## 6. 状态所有权

Dude 不持有任何领域状态或布局状态：

| 状态 | Owner |
|---|---|
| Session / Agent / Model / Preset / 文件 / 布局显隐宽度 | DSH 官方（Session Service / Agent Service / ui-layout / dockkit） |
| 样式表是否安装 | `ctx.effect`（插件挂载期间恒为已安装） |

没有 Layout Store、Inspector Store 或 Terminal Resource Manager。

---

## 7. 何时抽象

采用 Rule of Three：同一类问题出现第三个真实实例之前，不建立公共框架。当前插件只有
两个客户端模块，远未触发任何抽象信号。若未来新增第二个官方没有的增强能力，先直接实现，
不预先搭 Catalog / Registry / Definition 协议。

---

## 8. Electron 边界

- Main 只管窗口和打包版的 dsh 子进程；`win.removeMenu()`，没有原生菜单。
- 没有 Preload，没有 IPC，不开 `webviewTag`。Renderer 就是官方 web 客户端，只经 dsh
  的 HTTP 接口工作，拿不到 `fs`、`child_process` 或 `ipcRenderer`。
- 插件没有 host 侧业务端点（`deepbuddyFiles/*`、`/deepbuddy/media`、
  `/deepbuddy/terminal` 均已删除）；`src/host.js` 是空实现。文件能力由官方 dockkit 的
  Files 页提供；终端和浏览器在锁定版本里官方没有，升级到 0.1.6 后由官方提供。
- **配置隔离**：发行版一律以 `DSH_HOME=~/.dude` 运行，用户数据（settings /
  credentials / sessions / storages / profiles）全部落在 `~/.dude`，与官方 `~/.dsh`
  自首次迁移时刻起分叉、互不可见。首次运行（`~/.dude` 不存在）从 `~/.dsh` **复制**
  （非移动，官方目录只读）。两个 profile：
  - `~/.dude/profiles/dude`：开发用，由启动器 `scripts/dude` 起；首次迁移时从
    `~/.dsh/profiles/dude` 用 `cp -RP` 复制，保留指向本仓库的插件符号链接；
  - `~/.dude/profiles/dude-app`：打包版专用，由 `apps/desktop/main.js` 每次启动时生成，
    插件从 app 资源目录复制进来，不链接源码仓库，也不与开发热更新冲突。

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
- 唯一的 Effect（样式表）卸载时清理干净；
- 客户端 bundle 里不出现已删除功能的痕迹（xterm、`deepbuddyFiles`、
  `/deepbuddy/terminal` 等）；
- `node scripts/sync-upstream.mjs --smoke` 三项全绿；
- 在桌面壳里目测：左栏展开和收起、右栏全屏几种状态下，红绿灯不压官方控件，拖拽区域
  能拖窗口、其中的按钮能点；打开设置弹窗时拖拽区全部让位；Hero 显示官方鲸鱼。
