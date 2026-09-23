# Dude UI 设计意图

> 状态：现行
> 这是一份产品与交互约束，不是公共插件协议。

---

## 1. 核心结构

Dude 不拥有布局。窗口的列结构、列的开关、列内容、响应式收列，全部由官方
`ui-layout` / `ui-sidebar` / `ui-conversation` / dockkit（官方右栏）决定。Dude 在这套
官方结构上只叠加两层：

```text
窗口拖拽区域   —— 让无边框窗口在 macOS 上可以用鼠标拖动、给红绿灯让位、不挡官方控件
Hero 品牌标记  —— 官方 Hero 的 conversation.hero.brand.mark 槽渲染 Dude 的鱼标
```

没有 Sidebar / Workbench / Inspector 三列职责划分，没有 Dude 自己的状态栏、
Column、KIT 组件或设计令牌体系。官方组件的圆角、配色、字体由官方主题决定，Dude 不
覆写；尺寸和位置只动红绿灯避让和右栏全屏需要的三处（见 §2）。

---

## 2. 窗口拖拽区域

无边框窗口（macOS `hiddenInset`）需要显式声明哪些区域可以拖动整个窗口。Dude 的
样式表（`plugins/dude/src/client/ui/styles.ts`）在以下官方元素上加
`-webkit-app-region: drag`，其余全部保持不可拖：

| 区域 | 定位方式 | 说明 |
|---|---|---|
| 官方左栏整列 | `:has(> [data-rightbar-col]) > div:first-of-type` | 整列可拖，列内按钮自行退出；加 `padding-top: 36px` 让出红绿灯 |
| 首页 Hero 页面 | `[data-phase="hero"]` | 空白 / 新任务页整页可拖，Composer（`[data-composer-seat]`）除外 |
| 官方右栏 Tab 栏 | `[data-rightbar-col] [data-dockkit-strip]` | 栏内是按钮的 Tab 自行退出，空白处可拖 |
| 会话标题栏 | `header:has([data-conversation-header-corner])` | 标题和按钮之外的空白可拖 |

按钮、链接、输入框、`role="tab"` / `"button"` / `"menuitem"` / `"treeitem"` /
`"dialog"` / `"menu"` / `"listbox"` / `"option"`、`contenteditable` 全部无条件退出拖拽
（`no-drag`），且这条规则不限定作用域：Electron 按视口全局收集拖拽矩形，一个通过
Portal 挂到拖拽区域之上的菜单或对话框如果不退出，点击会变成拖窗口而不是点中它。

拖拽区域只能加在官方元素本身上，不能用覆盖层盖住含官方控件的区域——那样会让控件的
点击变成拖窗口，因为覆盖层不是控件的祖先节点，控件无法退出。

### 红绿灯

壳把红绿灯放在 `trafficLightPosition {x: 14, y: 17}`：灯高约 14px，中心在窗口顶下约
24px，与官方会话标题栏的按钮、右栏 Tab 同一行。左栏顶部的 36px 内边距让左栏内容从灯
下方开始。

### 右栏全屏

官方右栏全屏时，面板 `position: fixed` 盖满整个窗口。Dude 按左栏状态改它：

- **左栏展开**：面板左缘锚到左栏右缘（CSS anchor positioning，左栏列是锚点
  `--db-sidebar`，`left: anchor(--db-sidebar right)`，
  `max-width: calc(100vw - anchor-size(--db-sidebar width))`），只盖会话区，左栏拖宽
  时跟着走。
- **左栏收起**：面板保持官方的整窗覆盖。红绿灯约 66px 宽，放不进 56px 的收起 rail，
  于是落在面板的 Tab 栏上；左上角 pane（各层祖先 split cell 都是第一格的那个）的 Tab
  栏加 `padding-left: 80px` 让出它们。

两种模式下 Tab 栏都保持官方高度，本来就和红绿灯同行，所以切换模式时图标不跳。两条规则
都挂在面板自己的 `data-sidebar-right-panel="fullscreen"` 上，这个属性在滑入动画之前就
设好，动画结束时不会跳一下。

Electron 收集拖拽区域时不管上面画了什么，被面板盖住的拖拽区仍会吞掉点击。所以面板
全屏时，会话标题栏切成 `no-drag`；左栏收起且面板打开时，收起的 rail 也切成 `no-drag`。

---

## 3. Hero 品牌标记

官方 Hero（首页 / 空白会话页）用 `conversation.hero.brand.mark` 槽渲染品牌图标，默认
是官方的鲸鱼 Logo（`FishLogo`，priority 0）。Dude 在同一个槽以 priority -1 注册
自己的版本（`DudeBrandMark`，`plugins/dude/src/client/dsh/adapter.ts`），单 occupant
槽只渲染较低优先级的 Dude 版本。

`DudeBrandMark` 是 Dude 自己的鱼：一条胖蓝鱼 SVG，34×25，宽度与官方 34px 的品牌格
一致，用 app 图标（`apps/desktop/build/icon.png`）的配色——鱼身 `#7FB3E6`、肚皮
`#F7F1EC`、眼睛 `#3F6FB5`、腮红 `#F2C4C0`。颜色直接写死，不走 `currentColor`，所以
浅色和深色主题下是同一条鱼。

官方的标题（“探索未至之境”）和预览徽标（“预览版”）不受影响，因为它们是
`ui-conversation` 独占的本地化文案，不经过这个槽。

标记本身有一个悬停摆动动效（`.hero-fish:hover`），`prefers-reduced-motion: reduce`
时不播放。

---

## 4. 视觉语言

Dude 不维护独立的颜色、圆角、间距、字体或组件体系。界面视觉由官方主题（`--dsw-*`
变量）决定，正文和代码字体都是官方的。Dude 自己决定的视觉只有：

- **Hero 鱼标**：见第 3 节；
- **红绿灯避让与右栏全屏**：见第 2 节的三处尺寸和位置调整；
- **窗口底色**：壳的 `backgroundColor` 跟官方地色 `--dsw-alias-bg-base` 一致（浅色
  `#ffffff`、深色 `#151517`），快速拖动或缩放、网页还没重绘时不闪错色。

没有 Dude 专属的 Token 前缀（`--db-sidebar` 只是 CSS 锚点名，不是设计令牌）、KIT 组件
库或暗色方案定义。这几处不构成体系化的理由；出现第三个需要独立视觉覆写的官方区域时
再评估。

---

## 5. 当前不做

- 自绘的第二套侧栏、状态栏或检查器；
- 布局响应式规则（完全由官方 ui-layout 处理）；
- 设计令牌体系、KIT 组件库；
- 任意 Feature 自定位浮窗、任意 Webview 或 Overlay；
- 多主题生态。

终端和浏览器是锁定版本（0.1.5-rc.2）的能力缺口：官方右栏目前只有 Files 页，上游
0.1.6 加入 `ui-sidebar-terminal` / `ui-sidebar-browser`，升级官方版本即补上。Dude 不自建
平行实现。
