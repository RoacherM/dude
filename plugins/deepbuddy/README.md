# dsh-plugin-deepbuddy

DeepBuddy 发行版的界面层。官方 `ui-layout` 画窗口，官方侧栏画左列，官方会话画中列，
官方 dockkit 画右栏（含 Files 页）。DeepBuddy 不再有自己的右栏或检查器，只叠加两样
官方没有的东西：窗口拖拽区域和 Hero 品牌标记。卸载插件即回到纯官方界面。

```text
src/
├── client/
│   ├── app/App.tsx     # 入口：inject = ['slots']，调用 mountOfficialServices
│   ├── dsh/adapter.ts  # 唯一理解 DSH slot ABI 的层：装样式表 + 注册 Hero 品牌标记
│   └── ui/
│       ├── styles.ts   # 拖拽区域 CSS（-webkit-app-region）+ Hero 悬停动效
│       └── fonts.ts    # Archivo 字体 @font-face + --dsw-font-family 覆写
└── host.js              # Host 半部，空实现（name + 空 apply）
```

没有 `features/`、没有静态 Catalog、没有 Layout Store、没有 KIT 或设计令牌。之前存在
的三列布局壳、Inspector（Terminal / Browser / Files 预览）已整体删除，由官方 dockkit
右栏取代；host 侧的 `deepbuddyFiles/*` 端点、`/deepbuddy/media`、`/deepbuddy/terminal`
和 `node-pty` / `ws` / `xterm` 等运行时依赖随之移除。客户端 bundle 从 643KB 降到 55KB。

## 架构要点

- **只有两个客户端模块**：`dsh/adapter.ts` 是唯一理解 DSH ABI（`ctx.slots.inject` /
  `.register`）的文件，做两件独立的事，各自一个 `ctx.effect`：
  1. 安装样式表（`installStyles(FONT_CSS)`）；
  2. 把 `DeepBuddyBrandMark` 注册进官方 Hero 的 `conversation.hero.brand.mark` 槽，
     优先级 -1（低于官方 `FishLogo` 的优先级 0，单 occupant 槽渲染较低优先级的）。
- **官方 frame 保持启用**：`cordis.patch.yml` 不禁用 `ui-layout` / `ui-sidebar`，只
  显式保留 `ui-conversation`（它注入 `layout`，由官方 `ui-layout` 提供）并 insert
  `deepbuddy` 这一行。DeepBuddy 不注册 `root`，不提供第二份 `layout`。
- **窗口拖拽区域**（`ui/styles.ts`）：通过官方组件暴露的 `data-*` 属性定位，不依赖
  hash 化的 class 名：
  - 官方左侧栏顶部 36px（`:has(> [data-rightbar-col]) > div:first-of-type`）避让
    macOS 交通灯；
  - 首页 Hero 页面（`[data-phase="hero"]`）整页可拖，Composer（`[data-composer-seat]`）
    除外；
  - 官方右栏 Tab 栏（`[data-rightbar-col] [data-dockkit-strip]`）空白处可拖，Tab
    按钮自行退出；
  - 右栏全屏模式下，每条 Tab 栏（`[data-rightbar-fullscreen] [data-dockkit-strip]`）
    顶部加 4px 内边距与交通灯同高，左上角 pane 的栏（没有更上层 split cell 的那个
    `[data-dockkit-pane]`）再让出 80px 给交通灯——不是一条独立的 36px 标题带；
  - 会话标题栏空白处（`header:has([data-conversation-header-corner])`）可拖，标题和
    图标按钮除外。
  - 按钮、链接、输入框、`role="tab/button/menuitem/treeitem"`、`contenteditable`、
    对话框、菜单、下拉列表全局退出拖拽（不限定作用域，因为 Electron 按视口全局收集
    拖拽矩形，Portal 出来的菜单/对话框也要能退出）。
- **正文字体**：`ui/fonts.ts` 内嵌 Archivo 的 latin 变量子集 woff2，覆写
  `--dsw-font-family`；代码字体 `--ds-font-family-code` 维持系统等宽栈。
- 卸载插件即释放两个 `ctx.effect`：样式表和 Hero 品牌标记同时消失，官方界面完整还原。

## 已知边界

- 没有 DeepBuddy 自己的 Terminal / Browser / Files 预览；这些能力现在完全由官方
  dockkit 右栏提供。
- 没有 host 侧业务逻辑；`src/host.js` 只声明 `name` 和一个空 `apply`。

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
pnpm --filter dsh-plugin-deepbuddy test        # 构建 + bundle 契约测试（12 条，tests/plugin.test.mjs）
pnpm --filter dsh-plugin-deepbuddy typecheck
```

契约测试把构建产物当 artifact 检查：自注册、依赖表只剩平台外部模块、官方 frame 未被
重新声明、拖拽区域和 Hero 品牌标记存在、已删除功能（xterm、`deepbuddyFiles`、
`/deepbuddy/terminal` 等）不出现在 bundle 或 host 半部里、`package.json` 没有运行时
`dependencies`。

桌面壳见 `apps/desktop/`（Electron，加载本地 `dsh web`）。
