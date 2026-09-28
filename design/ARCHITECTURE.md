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

窗口用 macOS 系统标题栏，官方界面原样铺在标题栏下面，拖动窗口就是拖系统标题栏。
Dude 插件因此不需要贡献任何界面代码——它的 `apply` 是空函数。Hero 的品牌标记也用
官方的鲸鱼。

没有第二套侧栏、没有自绘布局、没有自己的检查器（Inspector）。官方缺的能力是能力缺口，
靠升级官方版本补，不自绘平行实现：锁定的 0.1.5-rc.3 官方右栏只有 Files 页，终端和
浏览器由上游 0.1.6 的 `ui-sidebar-terminal` / `ui-sidebar-browser` 提供。已删除的自研
部分见 `FEATURE_MAP.md` §3。

---

## 2. 现行架构图

```text
Electron Main（apps/desktop/main.js）
├── 窗口：系统标题栏（标题「Dude」）、底色
├── 打包版起停 dsh 子进程（profile dude-app）
├── 内核热更新（kernel.js，Dude 菜单「检查内核更新…」）
└── 页面开新窗口的链接交给系统浏览器

Renderer（官方 web 客户端；没有 Preload，没有 IPC）
└── DSH Upstream Core & UI（官方全量复用，未做二次包装）
    ├── AppFrame（官方 ui-layout，完整铺在系统标题栏下方）
    ├── Official Sidebar（工作区 / 会话列表 / 设置入口）
    ├── Official Conversation（会话流 / Agent Loop / Hero / 输入框）
    ├── Official Rightbar（dockkit：锁定版本只有 Files 页）
    └── Dude Plugin（`apply` 为空，只为让 boot manifest 认得出是 Dude 的）
```

---

## 3. 插件结构

插件只有一个客户端模块，没有 Feature 目录、没有静态 Catalog、没有 Shell：

```text
src/client/
└── app/App.tsx         # 入口：name + 空 apply(_ctx)
src/host.js              # Host 半部，空实现（只声明 name + 空 apply）
```

`apply` 是空函数：窗口用系统标题栏，官方界面完整铺在标题栏下面，页面侧没有任何东西
需要 Dude 添加。插件行留着，是因为打包和 profile 生成引用它、且
`scripts/sync-upstream.mjs` 的冒烟检查要在 boot manifest 里认出 `dsh-plugin-dude`。

新增能力前先确认：官方是否已经原生提供。Dude 不为了“可能有用”预先搭 Feature
目录、Catalog 或 Registry —— 当前没有任何自研 UI 模块，抽象没有意义。

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

`app/App.tsx` 是唯一的客户端模块，`apply` 是空函数：不注册任何 slot，不 `inject`
任何服务，不接触官方应用的任何内部状态。DSH ABI 目前没有实际使用者，`src/client/dsh/`
这层不存在——新增任何接触官方内部的代码都必须先在这里落地，而不是散落在 `App.tsx`
或 host 半部。

不覆写内部私有 ABI，不用 CSS 隐藏官方组件，不写死 hash 化的 class 名——这条约束
即使当前没有样式代码也继续保留，作为将来任何界面改动的边界。

---

## 6. 状态所有权

Dude 不持有任何领域状态或布局状态：

| 状态 | Owner |
|---|---|
| Session / Agent / Model / Preset / 文件 / 布局显隐宽度 | DSH 官方（Session Service / Agent Service / ui-layout / dockkit） |
| 窗口 chrome（标题栏、可拖拽区域） | macOS 系统标题栏（Electron 默认窗口，不是 Dude 的状态） |

没有 Layout Store、Inspector Store 或 Terminal Resource Manager。

---

## 7. 何时抽象

采用 Rule of Three：同一类问题出现第三个真实实例之前，不建立公共框架。当前插件没有
任何自研 UI 模块，远未触发任何抽象信号。若未来新增第一个官方没有的增强能力，先直接
实现，不预先搭 Catalog / Registry / Definition 协议。

---

## 8. Electron 边界

- Main 只管窗口、打包版的 dsh 子进程和内核热更新。原生菜单是 macOS 标准菜单，只多一项
  「检查内核更新…」，见下面「内核热更新」。
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

### 内核热更新

内核就是 dsh 运行时（`@deepseek-ai/dsh` 及其依赖）。app 自带一份（基线，版本等于根
`package.json` 锁定的版本）。热更新不重装 app，用 app 自带的 pnpm 把 npm 上更新的版本
装进 `~/.dude/runtime/<版本>`。

| 状态 | 在哪 | 谁写 |
|---|---|---|
| 基线内核 | `Dude.app/Contents/Resources/dsh-runtime` | 打包（`stage-runtime.sh`） |
| 热更新内核 | `~/.dude/runtime/<版本>`，装到 `.install-<版本>` 成功后才改名 | `kernel.js` |
| 正在跑的内核 | `main.js` 的 `dsh`（子进程、运行时、地址） | `main.js` |

启动时跑版本最高的那份，所以装了更新的 app 之后，它自带的新基线会盖过旧的热更新。
目录列表就是全部状态，没有另存的指针文件。

```text
点「检查内核更新…」
  → 查 npm dist-tags，取 latest / next 中较新者（alpha 不算，与 sync-upstream 同规则）
  → 不比当前新：提示「已是最新」
  → 更新：确认 → pnpm 装到 ~/.dude/runtime/<新版本>
          → 停掉旧内核（两个 dsh 不同时写 ~/.dude）→ 起新内核
          → 起来了：窗口切到新地址，删掉其它热更新目录
          → 起不来：删掉新目录，重起旧内核，报错
```

热更新跳过了 `sync-upstream.mjs --apply` 的契约测试和冒烟，这是取舍：更新快，但壳与
dsh 之间的接口（启动参数、`dsh web:` 输出行、插件加载位置、保留的 profile 名、支持的
Electron 版本）如果变了，问题会直接出现在用户机器上。

内核跑在 app 自带的 Electron 上（`ELECTRON_RUN_AS_NODE`）。dsh 从 0.1.7 起启动时用原生
插件 `node-addon-require-builtin` 取 Node 内部的模块解析器，这个插件在 Electron 下只认
它列出的几个具体版本（按 V8 版本精确比对，同一大版本的补丁版也不行，0.1.6 认 43.0.0、
43.1.0、44.0.0）。所以 `apps/desktop/package.json` 把 Electron 钉死在其中一个版本，不写
`^`；升级 Electron 前先确认新版本在插件的列表里，否则内核起不来。起不来的会自动回退。

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
- `client.js` bundle 不重新声明 `root`、`sidebar`、`main` 或第二份 `layout`，也不出现
  `app-region` 或 `<style>` 注入；
- 插件卸载后官方界面完整可用，不留下任何遗留状态；
- 客户端 bundle 里不出现已删除功能的痕迹（xterm、`deepbuddyFiles`、
  `/deepbuddy/terminal` 等）；
- `node scripts/sync-upstream.mjs --smoke` 三项全绿；
- 在桌面壳里目测：窗口标题栏是系统标题栏、标题显示「Dude」，官方 UI 完整铺在标题栏
  下方，没有被裁切或遮挡；拖动标题栏能拖窗口；Hero 显示官方鲸鱼。
