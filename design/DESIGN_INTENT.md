# Dude UI 设计意图

> 状态：现行
> 这是一份产品与交互约束，不是公共插件协议。

---

## 1. 核心结构

Dude 不拥有布局。窗口的列结构、列的开关、列内容、响应式收列，全部由官方
`ui-layout` / `ui-sidebar` / `ui-conversation` / dockkit（官方右栏，自带 Files 页）
决定。Dude 在这套官方结构上只叠加两层：

```text
窗口拖拽区域   —— 让无边框窗口在 macOS 上可以用鼠标拖动、不挡官方控件的点击
Hero 品牌标记  —— 官方 Hero 的 conversation.hero.brand.mark 槽渲染 Dude 的鱼形标记
```

没有 Sidebar / Workbench / Inspector 三列职责划分，没有 Dude 自己的状态栏、
Column、KIT 组件或设计令牌体系。官方组件的尺寸、圆角、间距、配色由官方主题决定，
Dude 不覆写。

---

## 2. 窗口拖拽区域

无边框窗口（macOS `hiddenInset`）需要显式声明哪些区域可以拖动整个窗口。Dude 的
样式表（`plugins/dude/src/client/ui/styles.ts`）在以下官方区域上加
`-webkit-app-region: drag`，其余全部保持不可拖：

| 区域 | 定位方式 | 说明 |
|---|---|---|
| 官方左侧栏顶部 36px | `:has(> [data-rightbar-col]) > div:first-of-type` | 避让 macOS 交通灯 |
| 首页 Hero 页面 | `[data-phase="hero"]` | 空白 / 新任务页整页可拖，Composer 除外 |
| 官方右栏 Tab 栏 | `[data-rightbar-col] [data-dockkit-strip]` | 栏内是按钮的 Tab 自行退出，空白处可拖 |
| 官方右栏全屏模式的 Tab 栏 | `[data-rightbar-fullscreen] [data-dockkit-strip]` | 顶部加 4px 内边距，让栏与交通灯同高；左上角 pane 的栏再让出 80px 给交通灯 |
| 会话标题栏空白处 | `header:has([data-conversation-header-corner])` | 标题和按钮之外的空白可拖 |

按钮、链接、输入框、`role="tab"` / `"button"` / `"menuitem"` / `"treeitem"`、
`contenteditable`、对话框、菜单、下拉列表全部无条件退出拖拽（`no-drag`），且这条规则
不限定作用域：Electron 按视口全局收集拖拽矩形，一个通过 Portal 挂到拖拽区域之上的菜单
或对话框如果不退出，点击会变成拖窗口而不是点中它。

拖拽区域只能加在官方元素的空白处，不能整块覆盖含官方控件的区域——那样会让控件的点击
变成拖窗口，因为覆盖层不是控件的祖先节点。

---

## 3. Hero 品牌标记

官方 Hero（首页 / 空白会话页）用 `conversation.hero.brand.mark` 槽渲染品牌图标，默认
是官方的鱼形 Logo（`FishLogo`，priority 0）。Dude 在同一个槽以 priority -1 注册
自己的版本（`DudeBrandMark`，`plugins/dude/src/client/dsh/adapter.ts`），
两者矢量路径与尺寸对齐（34×25，`FISH_LOGO_PATH`），单 occupant 槽只渲染较低优先级的
Dude 版本。官方的标题（“探索未至之境”）和预览徽标（“预览版”）不受影响，因为它们
是 `ui-conversation` 独占的本地化文案，不经过这个槽。

标记本身有一个悬停摆动动效（`.hero-fish:hover`），`prefers-reduced-motion: reduce`
时不播放。

---

## 4. 视觉语言

Dude 不维护独立的颜色、圆角、间距或组件体系。界面的绝大部分视觉由官方主题
（`--dsw-*` 变量）决定，Dude 只覆写两处：

- **正文字体**：`--dsw-font-family` 改为 Archivo（Omnibus Type，OFL-1.1，latin 变量子集
  内嵌为 woff2），中文回退到 PingFang SC / 系统字体栈；代码字体
  `--ds-font-family-code` 保持系统等宽栈不变（`plugins/dude/src/client/ui/fonts.ts`）。
- **Hero 品牌标记**：见第 3 节。

没有 Dude 专属的 Token 前缀、KIT 组件库或暗色方案定义——这些随三列壳、Inspector
一起删除。若未来出现第二个需要独立视觉覆写的官方区域，届时再评估是否需要一套 Token，
当前只有两处覆写，不构成体系化的理由。

---

## 5. 当前不做

- 自绘的第二套侧栏、状态栏或检查器；
- 布局响应式规则（完全由官方 ui-layout 处理）；
- 设计令牌体系、KIT 组件库；
- 任意 Feature 自定位浮窗、任意 Webview 或 Overlay；
- 多主题生态。

未来 Terminal / Browser 等增强能力若要重新引入，必须是通过官方公开 Slot（例如 dockkit
的 Tab 扩展点）挂载的官方形态增强，而不是重建一个平行右栏。
