# M1 layout 内核就位 handoff

- 日期 / agent：2026-08-18 / claude
- 目标：把 `plugins/deepbuddy` 从「一整块手写界面」改造成**布局内核 + `dbdy.*` 座位合同**，
  现有界面降级为同包临时占用者，全程界面可用。方案见
  [[2026-08-18-layout-kernel-and-self-iteration]]，纠偏见
  [[2026-08-18-layout-kernel-not-monolith]]。

## 已完成

### 内核（手写的部分，只有这些）

| 文件 | 职责 |
|---|---|
| `src/client/styles.ts` | 暗色 token 全集 + `.dbdy-*` 类；`METRICS`（topbar 52 / sidebar 268 / chat 720 / settings 820） |
| `src/client/geometry.ts` | 侧栏 clamp（232–380，默认 268）、Dock 46%/30–70%/416px 地板、`dockFits` 拒开 |
| `src/client/icons.tsx` | 36 个字形，1.7/2 描边规则 |
| `src/client/kit.tsx` | `KIT`：Button/IconButton/Input/Select/Switch/Badge/StatusPill/Card/Popover/Dialog/EmptyState/Tabs/SettingRow/Dot/Mono，`Object.freeze` |
| `src/client/seats.ts` | 座位合同：5 个 `dbdy.*` 槽的 SlotMap 声明 + `SeatFace`/`DockPaneFace`/`SeatProps` |
| `src/client/frame.ts` | `LayoutController`（状态机 + 拖拽 + 快捷键 + `ctx.layout` 面）、`useFrame`/`useSeatEntries`/`pickEntry` |
| `src/client/Chrome.tsx` | root 占用者：窗口盒 / 列 / `TopBar` / `TrafficLights` / Dock 列 / 整窗设置壳 |
| `src/client/Sidebar.tsx` | `sidebar` 占用者：268 容器，声明并渲染 nav / section |
| `src/client/Main.tsx` | `conversation` 占用者：52px 顶栏，声明并渲染 `dbdy.main.view` |

座位表（全部 `list` kind，用 `RenderOpts.only` 派发单个条目）：

| 槽 | scope | inject | 声明者 | 对应用环开放 |
|---|---|---|---|---|
| `dbdy.main.view` | session-maybe | `SeatFace` | Main.tsx | 否 |
| `dbdy.sidebar.nav` | root | `SeatFace`（+ owner `{current}`） | Sidebar.tsx | 否 |
| `dbdy.sidebar.section` | root | `SeatFace` | Sidebar.tsx | 否 |
| `dbdy.dock.pane` | root | `DockPaneFace` | Chrome.tsx | **是** |
| `dbdy.settings.page` | root | `SeatFace` | Chrome.tsx | **是** |

### 临时占用者（M2 逐个搬出去）

`src/client/store.ts`（数据面，从旧 `FrameController` 摘出布局后的剩余部分）+
`src/client/occupants/`：`Chat.tsx`（主视图 + 侧栏导航行）、`Sessions.tsx`（会话列表 section）、
`Explorer.tsx`（Dock 面板）、`Settings.tsx`（模式页 + 插件页）。

### 删除

`AppFrame.tsx` / `Conversation.tsx` / `WorkspacePanel.tsx` / `SettingsDialog.tsx` /
`mock.ts` / `ui.tsx`——共约 2900 行。删除前的整份 `src/` 快照在
`/tmp/deepbuddy-restore-2026-08-18/`（仓库仍是零 commit，未跟踪）。

### 三个设计决策（写进代码注释，复述在此以便复核）

1. **座位面只给动词，不给几何**。`LayoutVerbs` = setView / openDock / closeDock /
   openSettings / closeSettings / setTitle。I4「布局主权」因此是类型错误而不是口头规矩；
   契约测试断言 bundle 里不存在 `\bsetDockWidth|\bsetSidebarWidth|\bsetColumnWidth`。
2. **标签页是 Dock 的能力，不是各面板的**。设计稿给 Explorer/Browser/Terminal 各画一套
   标签栏＝同一个 38px 行抄三遍；现在 `LayoutState.tabs` 由内核持有，面板只拿
   `DockTabs`（open/close/focus，只传 id+label，不传 ReactNode——传 node 会把「文件正文
   稍后到达」冻死在 loading 态）。
3. **顶栏标题走 `layout.setTitle`**。标题是内容不是几何，内核不认识会话；只有 active 视图
   会被渲染，所以只有它能设，切视图自动清空。占用者必须在 effect 里调用（写内核状态）。

### 主题钉死 dark

`theme.ts` 的 presenter 不再读 `snapshot.active.colorScheme`：恒定写
`color-scheme: dark` + `data-ds-dark-theme`，并且**只在主题本身解析为 dark 时**才铺
`active.tokens`（light 主题的 alias 覆盖在暗底上是半反色，比不生效更糟）。这偿付了
P4a 留下的 R3 主题债——生态环座位不会再在 #0f0f0f 窗口里画白卡片。

## 视觉返工（同日第二轮，起因：用户「这布局你觉得能看？」）

第一版目视不合格。逐条对了原型的**实际 CSS**（不是我看截图的印象），四条里三条是我做糙了，
一条是我记错了原型：

| # | 我第一版 | 原型实际值（`prototype/DeepSeek Harness Desktop.dc.html`） | 处置 |
|---|---|---|---|
| 1 | 侧栏每个占用者各写行高（32 / 34 / 26），贴边无缩进 | `navBase` = 31px / pad 8 / radius 10 / gap 1；会话行 29；分组标签 11.5px·500·#5f5f5f，`padding:22px 8px 6px` | 行上提进 kit：`ROW_METRICS` + `Kit.Row` + `Kit.GroupLabel` |
| 2 | 只装了一个面板却画一个单段分段控件 + 横跨整栏的虚线空框 | —（原型三面板） | `panes.length > 1` 才画分段控件，否则「图标 + 名称」；没开标签页时树占满整栏，不再拆分 |
| 3 | 工具块只有「名字 + 完成 · 0.4s」 | `read` `src/auth/session.ts` `84 lines`：mono 11.5，名 #ededed，参数摘要 #6f6f6f 省略号，metric `margin-left:auto` | 加 `argSummary()` 从入参 JSON 取一行摘要；metric 用真实耗时（`84 lines` 是原型手写的假数据，猜不得） |
| 4 | 正文列左对齐 | README 第 27 行明说**左对齐（不居中）** | 我记错了，**不改**；正文字号按原型改 14 / 1.62 / #dcdcdc |

行进 kit 的理由（写在 `seats.ts` 的 `Kit.Row` 上）：高度、圆角、内边距和选中填充不是 prop。
三个座位各差 6px，正是「发行版发一套 kit」本来要杜绝的事。M2 拆包后座位在别的仓里，
这条只能靠类型和 kit 兜住。

新增契约测试 `the list row is the kit's fact, not each seat's`：断言 `ROW_METRICS` 的七个数
和 `Row`/`GroupLabel` 确实在冻结的 `KIT` 里（座位只能走 inject 面拿 kit，拿不到就只能自己发明）。

改动文件：`kit.tsx`（`ROW_METRICS`/`RowImpl`/`GroupLabel`，原 flex 助手 `ROW` 未动）、
`seats.ts`（`Kit` 加两个成员）、`Sidebar.tsx`、`Chrome.tsx`（`RailRow`、设置分组标签、Dock 顶栏）、
`occupants/{Chat,Sessions,Explorer}.tsx`。

截图：`reports/m1-kernel/rows-v2.png`（对话）、`rows-v2-dock.png`（Dock 单面板）、
`rows-v2-settings.png`（设置）、`rows-v2-tools.png`（工具块）。

## 验证

```sh
cd /Users/byron/Desktop/Projects/Devs/deepbuddy
pnpm build && pnpm typecheck && pnpm test    # deepbuddy 17 条全绿，terminal-probe 5 条全绿
DSH=/Users/byron/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh
"$DSH" --profile deepbuddy --port 3081       # 浏览器开 http://127.0.0.1:3081
```

真机截图（1440×900）：`reports/m1-kernel/dock-open.png`、`reports/m1-kernel/settings.png`。
浏览器控制台零 error。

契约测试新增/改写三条：
- `client bundle declares the dbdy.* seat contract at its renderers`——五个座位逐条断言
  kind/scope/inject，并断言声明者确实 `renderSlot` 了它（声明即认领）。
- `every column's top bar is one drag region, declared once`——共享 `TopBar` 后
  `WebkitAppRegion: "drag"` 应恰好出现 **1 次**（旧版手抄三份、并且漏了面板那份）。
- geometry 两条按新表重写（旧的 `clampRail`/`clampPanel`/`dockWidenTarget` 已随活动栏删除）。

## 未完成 & 下一步

- **M2 拆包**：把 `occupants/` 四个文件逐个搬进 `plugins/deepbuddy-{chat,sessions,explorer,settings}`，
  一次一个、行为零 diff。搬之前要先给 layout 包加一个 **type-only 的 `./client` 导出**
  （座位插件需要 `SeatProps`/`DockPaneProps` 的类型，值导入仍然是 bundle 纯净错误）。
- **M2 配套**：`plugins/_template/`——创造模式用的座位插件模板。
- **M3 点亮闭环**：`deepbuddy-approvals` 消费 `ctx.dynamicCordisRunner.approve/decline`，
  声明 `dbdy.modal` 与 `dbdy.palette.source`（M1 刻意没声明——未定级不声明）。
- **M4 自迭代**：browser / terminal / ⌘K / trajectory / settings-models / kanban / PR / automations。

## 关键决策与约束（用户已确认）

- 范围：全量骨架 + 视觉 + 接通官方能力面；文案**保持中文**；主题**暗色单一并把 dsh 钉成 dark**。
- 第一个插件就是 layout；模块边界参考 `design/synara` 的交互设计，但**该设计不必然是最优雅
  或最原子的**——已按此重切三处（标签上提为 Dock 能力、导航项跟随视图插件、Trajectory 归
  chat 正文区而非并列主视图）。
- Dock 面板打包粒度：Explorer / Browser / Terminal **各一个包**。
- 座位开放度：只向应用环开 `dbdy.dock.pane` 与 `dbdy.settings.page`。

## 第三轮（同日）：overlay 故障根治——文件端点内化，两个 overlay 插件出列 profile

起因：用户「刚才把我的 UI 布局开发的特别混乱，现在基本不能看」。整窗截图确认
「混乱」不是内核布局，而是 `shell.overlay` 上的三样东西：workspace-shell 无样式的
文件抽屉整棵叠在侧栏上、terminal-probe 小终端浮在正文右下、左上角「工作区」把手
压着红绿灯。

**上一轮的两处诊断是错的，以此节为准：**

1. 抢走 `data-plugin="dsh-plugin-workspace-shell"` 样式标签的不是动态包
   term-1/pkg-1，是**我们自己的 terminal-probe**（`.dshtp` 正是它的类前缀；
   实测标签 `data-owner="dsh-plugin-terminal-probe"`）。`data-plugin` 属性是
   dsh 客户端加载器错误归属上去的。
2. 因此「重启可解」不成立——terminal-probe 持久在 profile 里，每次启动都会
   重新撞掉 workspace-shell 的样式。

**修法（不是隐藏，是拆依赖）：**

- workspace-shell 的 client（抽屉）与 host（文件 RPC）同一条 entry，loader 没有
  只关 client 的开关（`dsh-client-modules` 只看「entry 存活 + 包声明 dsh.client」）。
  于是把我们唯一依赖的 host 面**移植进 deepbuddy 自己的 host 半部**：
  `plugins/deepbuddy/src/host.js` 注册 `deepbuddyFiles/readFile|listDirectory`
  （含 rc.6 sessionPersistence 回退，逐行移植 + 27 条围栏测试一并移植为
  `tests/host.test.mjs`；`files.ts` 改调新端点）。
- profile（`~/.dsh/profiles/deepbuddy/package.json`）deps 与 bundles 移除
  workspace-shell 与 terminal-probe，`pnpm install`。boot 清单现在只有官方
  entries + `dsh-plugin-deepbuddy`（38 条）。这落实了 ARCHITECTURE.md 本就写着的
  「workspace-shell 实验性、未收编」与「shell.overlay 白名单（当前为空）」。
- 同步改：`scripts/sync-upstream.mjs`（冒烟项 3 改打 `deepbuddyFiles/*`、项 4
  boot 清单只要求 deepbuddy、删 workspace-shell 门禁步与 `WORKSPACE_SHELL_DIR`）、
  `.github/workflows/upstream-sync.yml`（删 dsh-plugins 检出与 plugin add）、
  README / UPGRADE / ARCHITECTURE / `plugins/deepbuddy/README.md` 对应段落。

**验证**：`pnpm build && pnpm typecheck && pnpm test` 全绿（deepbuddy **45** 条 =
原 17 − 1 条空壳 host 契约 + 1 条重写 + 28 条移植围栏；terminal-probe 5 条仍在仓、
只是出列 profile）；`node scripts/sync-upstream.mjs --smoke` 4/4 PASS（首轮跑出
2 项 404，为冒烟自身「等 `/` 200 即打 RPC」的存量启动竞态，复跑即绿，未修）；
3081 重启后整窗零 overlay 残留，Dock 文件树/文件正文走新端点正常，控制台零
error/warn。截图：`reports/m1-kernel/clean-overlay{,-dock,-file}.png`。

**遗留建议（未动手）**：`plugins/terminal-probe/` 包本身已无 profile 引用，
是 P4a 验收的历史证据；要不要从仓库删除由用户定。`plugins/deepbuddy/README.md`
整体仍描述 M1 前的旧 UI（活动栏四视图等已删），本轮只修了文件服务两处事实错，
全文重写留待 M2。

## 一个待查的数据现象（未定位，非本轮改动引入）

会话「研究DeepSeek-Harness插件开发」进去后正文区为空：`conv !== null`（否则会显示
「加载会话…」）、`nodes.length === 0`、`hasMore` 为 false，所以 store 认为这条会话没有
可渲染节点。同列表其它会话正常。本轮没有动 `store.ts`，故不认为是返工引入的；
需要单独查 `dsh.ts` 的节点折叠逻辑对这条 transcript 的处理。
