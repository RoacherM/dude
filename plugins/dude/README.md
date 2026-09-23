# dsh-plugin-dude

Dude 发行版的界面层。官方 `ui-layout` 画窗口，官方侧栏画左列，官方会话画中列，
官方 dockkit 画右栏。Dude 没有自己的右栏或检查器，只叠加一样官方没有的东西：窗口
拖拽区域。Hero 用官方鲸鱼标记。卸载插件即回到纯官方界面。

```text
src/
├── client/
│   ├── app/App.tsx     # 入口：调用 mountOfficialServices
│   ├── dsh/adapter.ts  # 唯一接触官方应用的层：装样式表
│   └── ui/
│       └── styles.ts   # 拖拽区域与红绿灯避让 CSS
└── host.js              # Host 半部，空实现（name + 空 apply）
```

没有 `features/`、没有静态 Catalog、没有 Layout Store、没有 KIT 或设计令牌。客户端
bundle 约 6KB，`package.json` 没有运行时 `dependencies`。

已删除的自研功能：三列布局壳、Inspector（Terminal / Browser / Files 预览）、host 侧
`deepbuddyFiles/*` 端点、`/deepbuddy/media`、`/deepbuddy/terminal`，以及 `node-pty` /
`ws` / `xterm` 等运行时依赖。Files 由官方右栏提供；终端和浏览器在锁定的 0.1.5-rc.3
里官方还没有，上游 0.1.6 的 `ui-sidebar-terminal` / `ui-sidebar-browser` 补上。

## 架构要点

- **只有两个客户端模块**：`dsh/adapter.ts` 是唯一接触官方应用的文件，在一个
  `ctx.effect` 里安装样式表（`installStyles()`，挂一个
  `<style data-owner="dsh-plugin-dude">`）。Dude 不注册任何 slot，Hero 是官方鲸鱼。
- **官方 frame 保持启用**：`cordis.patch.yml` 只 insert `dude` 这一行，不禁用或重述
  任何官方行。Dude 不注册 `root`，不提供第二份 `layout`。
- **窗口拖拽区域与红绿灯避让**（`ui/styles.ts`）：通过官方组件暴露的 `data-*` 属性
  定位，不依赖 hash 化的 class 名。红绿灯中心约在窗口顶下 24px，与官方会话标题栏
  按钮、右栏 Tab 同一行。
  - 官方左栏整列可拖（`:has(> [data-rightbar-col]) > div:first-of-type`），并加
    `padding-top: 36px` 让出红绿灯；这一列同时是 CSS 锚点 `--db-sidebar`；
  - 首页 Hero 页面（`[data-phase="hero"]`）整页可拖，Composer（`[data-composer-seat]`）
    除外；
  - 官方右栏 Tab 栏（`[data-rightbar-col] [data-dockkit-strip]`）空白处可拖，Tab
    按钮自行退出；
  - 会话标题栏空白处（`header:has([data-conversation-header-corner])`）可拖，标题和
    图标按钮除外；
  - 右栏全屏、左栏展开时，全屏面板左缘锚到左栏右缘（`left: anchor(--db-sidebar right)`，
    `max-width: calc(100vw - anchor-size(--db-sidebar width))`），只盖会话区；左栏收起时
    面板盖满整窗，左上角 pane（各层祖先 `[data-dockkit-cell]` 都是第一格的那个
    `[data-dockkit-pane]`）的 Tab 栏加 `padding-left: 80px` 让出红绿灯。两种模式下
    Tab 栏都保持官方高度，图标不跳；
  - Electron 收集拖拽区域时不看上面盖了什么，所以全屏面板盖住会话标题栏和收起的左栏
    rail 时，这两处切成 `no-drag`；
  - 按钮、链接、输入框、`role="tab/button/menuitem/treeitem/dialog/menu/listbox/option"`、
    `contenteditable` 全局退出拖拽（不限定作用域，因为 Electron 按视口全局收集
    拖拽矩形，Portal 出来的菜单 / 对话框也要能退出）。
- 卸载插件即释放唯一的 `ctx.effect`：样式表消失，官方界面完整还原。
  除左栏顶部 36px、全屏面板的左缘和左上 Tab 栏的 80px 外，不改官方的尺寸、配色和字体。

## 已知边界

- 没有 Dude 自己的 Terminal / Browser / Files 预览。锁定版本的官方右栏只有 Files 页，
  终端和浏览器要等升级到 0.1.6。
- 没有 host 侧业务逻辑；`src/host.js` 只声明 `name` 和一个空 `apply`。

## 安装

```sh
cd /path/to/dude
dsh --profile dude --from-default-profile web --dump-config > /dev/null
dsh plugin --profile dude add ./plugins/dude
dsh --profile dude --port 3081
```

源码 checkout 用 `pnpm dsh ...`。卸载：`dsh plugin --profile dude remove dsh-plugin-dude`（官方 shell 立即还原）。

## 开发

```sh
pnpm --filter dsh-plugin-dude build       # lib/index.js + lib/client.js
pnpm --filter dsh-plugin-dude test        # 构建 + bundle 契约测试（13 条，tests/plugin.test.mjs）
pnpm --filter dsh-plugin-dude typecheck
```

契约测试把构建产物当 artifact 检查：自注册、依赖表只剩平台外部模块、官方 frame 未被
重新声明、拖拽区域规则（含右栏全屏的锚点、`no-drag` 切换和模态对话框守卫）存在、Hero 未被替换、
已删除功能（xterm、`deepbuddyFiles`、`/deepbuddy/terminal` 等）不出现在
bundle 或 host 半部里、`package.json` 没有运行时 `dependencies`。

桌面壳见 `apps/desktop/`（Electron，加载发行版 profile）。
