# wave8 修复冷会话空白 transcript —— 官方 ui-conversation 接管手记

- 日期 / agent：2026-08-23 / claude
- 目标：修复打开历史（冷）会话 transcript 全空白（DeepBuddy 诞生以来缺陷）。
- git 基线：`eeb415a`（wave7 已合入）。**未 commit**。
- 复测入口：`node_modules/.bin/dsh --profile deepbuddy --port 3082 --no-open`，
  浏览器 http://127.0.0.1:3082；`pnpm build && pnpm typecheck && pnpm test`。

## 根因（wave7 查实，本波确认）

客户端把 events 折叠成 `conv.chat`/legacy 节点靠 **conversation registry**
（`conversationEvents`/`conversationViews`，dsh-client-runtime 提供）。注册表里只有
trajectory/goal/deliverables/workflow-run 的定义，**缺全部 chat 定义**
（message/assistant/tool/command/compaction/retry/turn-error/turn-max-tokens/turn-tail/
fallback + `chat` 视图）——它们由官方 `@deepseek-ai/dsh-client-ui-conversation` 的
`registerConversationNodes(ctx)` 注册，而该行在 DeepBuddy 的 cordis.patch.yml 里被
`disabled`，从未激活。实时流靠 host 推帧显示，turn 结束 partial 清空，折叠失败 → 空白。

## 方向裁决（用户拍板：官方接管）

本波研究后**推翻**了原任务书里「方案 B（受控调用 apply）」的可行性假设，并经用户
当面拍板改为**官方接管（方案 A）**：

1. **`apply` 运行时不可作为 ESM 导入**：`lib/client.js` 是 self-registering 脚本
   （`window.__ModuleLoader__.load({id, factory})`，`apply` 只在 factory closure 内），
   无 module-level ESM exports。
2. **`external` 无法把 disabled 的 bundle 拉进 boot graph**：`processOne` 对 disabled
   行 `table.delete`，compose 只从 table 构建；external 只重排已存在行的 arrival 顺序。
   而 re-enable 行会让其 apply 自动运行（manifest.plugins 1:1 映射 graph 行），
   parking 又触发 boot 抛 `entries did not activate`。
3. **官方 apply 声明整个 `conversation` 槽族 + 注册 `conversation` occupant**，与
   DeepBuddy 的自渲染（`DeepBuddyMain` + `CONVERSATION_INPUT_SLOT_MAP`）硬冲突
   （ui-slots 每槽一个声明者）。

结论：保留自研 UI 的受控调用路径不存在；唯一干净做法是**官方 ui-conversation 接管
主列**，DeepBuddy 只做槽声明者（sidebar.settings）+ 品牌/hero 接线 + layout stub。

## 改动清单

### 1. cordis.patch.yml：启用 ui-conversation
- `ui-conversation` 行改为 `name: '@deepseek-ai/dsh-client-ui-conversation'`（不 disabled）。
- `ui-layout`、`ui-sidebar` 仍 disabled。
- 作用：ui-conversation 的 client bundle 进入 boot graph，其 apply 注入 `layout`
  （由 DeepBuddy 提供）后激活，注册 chat 折叠定义 + 官方会话列。

### 2. adapter.ts：提供 layout 服务 + 品牌 hero + sessionStarted 观察
- `mountOfficialServices` 增加 `ctx.reflect.provide('layout', layout.layoutFace())`
  （ILayout stub，三个动词转发到 LayoutStore）。
- `DeepBuddyBrandMark` 组件注册进 `conversation.hero.brand.mark`（priority -1，
  取代官方 FishLogo），渲染「DeepBuddy」+ slogan「向着未知出发，把每一步都变成脚印。」。
  （slot key 在 DeepBuddy 类型图外，用 untyped `slots` 断言注入。）
- 增加 session-started watcher：观察当前 session 的 `blank` 状态，写入
  `layout.setSessionStarted`（原由死亡 ChatView 负责，现由 Adapter 接管，保证 dock
  门控正确）。binding 未就绪时 `queueMicrotask` 重试。

### 3. 删除自研被官方覆盖的部分（删减纪律）
- `App.tsx`：移除 `conversation` occupant 注册 + `CONVERSATION_INPUT_SLOT_MAP` 导入。
- `adapter.ts`：删除 `CONVERSATION_INPUT_SLOT_MAP` / `ConversationInputSlotKey`。
- `ThreeColumnFrame.tsx`：删除 `DeepBuddyMain` 及 `WORKBENCH_APPS` 派发。
- `catalog.ts`：删除 `WorkbenchAppDefinition` 接口 + `WORKBENCH_APPS` 数组。
- `features/conversation/Chat.tsx`：重写为仅保留 `CONVERSATION_APP_ID` + `ChatNav`
  （新建任务按钮）；删除 `ChatView`/`Composer`/`PermissionChip`/`Hero`/
  `renderChatNodes`/`ToolBlock` 等。
- `features/conversation/index.ts`：删 `ConversationAppDefinition`/`ChatView` 导出。
- `store.ts`：删除死方法 `send`/`stop`/`loadOlder`/`toggleCall`/`pickWorkspace`/
  `openLocalFolder`/`resolveHome`/`defaultWorkspace` + 相关 state（draft/sendError/
  homePath/openCalls）；保留 `newTask` + session 观察 + `currentSummary`/`isBlank`。
- client.js bundle 由 151KB → 110.9KB。

### 4. dsh/adapter.ts DSH ABI 边界维持
layout 提供/品牌 hero/sessionStarted watcher 全部在 `dsh/adapter.ts`（唯一 DSH ABI 层）。

### 5. 测试重写（plugin.test.mjs，55 条）
- 删除/改写断言自研 conversation/composer/permission 的旧断言；
- 新增：ui-conversation 启用（patch 断言）、`reflect.provide("layout")`、
  品牌 hero `priority: -1` + slogan、`layoutFace()`；
- 删除 WORKBENCH_APPS / `jsx(active.Component)` / `conv.chat.order` 断言；
- NO_DRAG 阈值 6 → 4（DeepBuddyMain 删除后）。

## 验证（全部通过）

```sh
pnpm build && pnpm typecheck && pnpm test
# deepbuddy 55 条全绿；terminal-probe 5 条全绿。
```

浏览器实测（puppeteer 类 CDP，端口 3082）：

1. **冷会话 transcript**：打开「中文普通话学习助手介绍」「介绍自己」「模型与工具信息
   说明」→ 完整对话渲染（user 消息 + 上下文注入 + Think + assistant 回复 + turn 元数据），
   与官方 3080 一致。**冷会话空白 bug 修复**。
2. **实时会话**：hero 发「测试：请回答1+1等于几」→ 流式渲染 → turn 结束内容留存；
   reload 后同会话内容仍在。
3. **工具会话**：打开「介绍AI助手功能」（1349 次 tool/call）→ transcript 25KB，
   56 个 tool block 元素渲染，无 crash。
4. **品牌 hero**：blank 页 hero 显示「DeepBuddy」+ slogan「向着未知出发，把每一步都
   变成脚印。」+ 工作空间 chip（deepseek-harness）+ 模式 chip（创造模式）+ 模型。
5. **boot**：无「Failed to load plugins / did not activate / waiting for service」，零
   console error。
6. **媒体**：`/deepbuddy/media` host 路由保留（host.js 未动），未授权请求 403（fenced
   正常），官方 `conversation.message.images`（ui-attachment）在 graph。
7. **corrupt session**：官方 `ChatView` 处理 `openState === 'error'` →
   `t("chat.loadError", {message, code})`，非空白。

## 关键决策 / 依据

- **官方接管而非受控调用**：受控调用需 `apply` 可导入，但 client bundle 是
  self-registering、disabled 行被排除出 boot graph、external 无法拉入、re-enable 会
  致命 parking 或冲突。用户拍板按官方接管落地。
- **layout stub 边界**：只实作官方 `ILayout` 三动词转发到 LayoutStore；不接管官方
  layout 面板几何，不把 DeepBuddy dock 与官方 `details` 槽混为一谈。
- **删除纪律**：被官方覆盖的 Stream/Composer/PermissionChip/Hero/ChatView/
  DeepBuddyMain/WORKBENCH_APPS 全部删除，无兼容层。
- **品牌槽单声明者冲突**：`conversation.hero.brand.mark` 是 single 槽，官方
  brand-official 以 priority 0 注册 FishLogo，DeepBuddy 以 -1 注册品牌（lowest wins）。

## 未完成 / 下一步

- **`+` 附件入口**：官方 `conversation.input.attachments` 槽已由官方 apply 声明，
  ui-attachment 注册入该槽；hero/composer 的 `+` 入口（IconPlusOutline16）属于官方
  composer-bar，已随官方接管恢复。若仍有缺口（显式文件选择按钮），需官方 input-hub
  `conversation.input.for` 合同，未做。
- **dock 文件列**：DeepBuddy `InspectorColumn`（files/terminal）仍由 frame 渲染
  （`s.dock && s.sessionStarted`）；sessionStarted 由 adapter watcher 驱动。dock 与
  官方 `details` 槽并存但独立。dock 的可见 toggle 按钮在官方接管后未复置于会话头
  （可用 ⌘J 切换）——如需恢复显式按钮，登记 `conversation.session.header.actions`。
- `reports/restructure/` 为既有未跟踪目录，非本波产物。

---

# wave8 修复轮（2026-08-23）：官方接管后的布局/品牌/dock 三处缺陷

- 基于 wave8（未 commit）修复三处缺陷。复测入口同上。

## D1（修复）：主列不铺满，右侧大片空洞

- 根因：`.dbdy` frame 是 `display: flex`，官方 `ConversationRoot`（`.wSkVaW_root`）
  是 `flex: 0 1 auto`（content 尺寸），会话页只占 ~60%（712px）、空白 hero 被压到
  ~370px 窄条。
- 修复：`ThreeColumnFrame.tsx` 把 `renderSlot('conversation')` 包进一个
  `flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden`
  的容器（镜像官方 AppFrame 的 `minmax(0, 1fr)` 中心列）。slot outlet 的
  `display: contents` 让 `.wSkVaW_root` 参与该容器 flex，`align-self: stretch`
  使其撑满宽度。
- 验证：会话页 `.wSkVaW_root` 实测 1096px（1365 窗口减去侧栏+handle）；空白 hero
  同样 1096px。工具详情抽屉 enclosure：frame 的 `details` div 用
  `flex: 0 0 ${detailsOpen ? 480 : 0}px`，收起时不占位（detailsW: 0，旧的 32px 竖条
  消失），打开时官方 DetailsPanel 480px。
- 证据：`reports/restructure/w8-fix-session-dock.png`。

## D2（尽力修复）：hero 品牌与官方标语叠加

- 根因：官方 hero 是 `grid-template-columns: 34px auto auto`（`34px` 固定 brand 列）。
  DeepBuddy brand mark 原渲染 name+slogan 块（204px 宽），溢出 34px 列叠进 headline。
- 修复：`DeepBuddyBrandMark` 改为紧凑 name-only wordmark（font 11，残 ~4px 重叠）；
  品牌列被官方鱼 logo 替换（priority -1）。DeepBuddy slogan「向着未知出发，把每一步都
  变成脚印。」移到**侧栏品牌行**（`ThreeColumnFrame` sidebar brand 下加 slogan 小字）。
- **技术约束（如实记录）**：官方 `hero.headline`/`hero.preview` 是硬编码
  `t("hero.headline")`，`conversation` locale NS 是单 occupant（ui-conversation
  register 抛 `namespace already has locale`）；接管该 NS 会**直接打崩 ui-conversation**
  （实测：`@deepseek-ai/dsh-client-ui-conversation failed to apply...already has locale
  "zh"`）。且 34px brand 列无法容纳 wordmark。故「DeepBuddy slogan 取代官方标语」在
  不改 ui-conversation、不 CSS 硬盖的前提下**不可行**；品牌区显示 DeepBuddy 名，
  官方「探索未至之境/预览版」为固定文案保留，DeepBuddy slogan 在侧栏。
- 证据：`reports/restructure/w8-fix-hero.png`。

## D3（修复）：dock 文件列入口消失

- 根因：dock toggle（PanelRight）原在 DeepBuddy 主列头（`DeepBuddyMain`），随官方
  接管删除后无入口。
- 修复：`App.tsx` 新增 `DeepBuddyDockToggle` 组件，注册进官方
  `conversation.session.header.actions`（additive list slot，order 30）。它走
  `useAppDeps().layout.toggleDock(INSPECTOR_VIEW_TYPES[0]?.id)`，dock 开合仍经
  layout-store，门控规则不变（仅会话内可见，官方 header 只对 started session 渲染）。
- 验证：会话页 session header 出现「打开停靠栏」按钮（title/aria-label + svg）；
  点击打开 dock（416px 文件列，deepseek-harness / GPT-Image2分享 文件树）；再点关闭；
  hero（blank）页不显示该按钮（dockToggle=0）。

## 顺带验证

- **媒体预览不回归**：图片（.artifacts/*.png）经 `/deepbuddy/media/<session>/<path>`
  渲染为 `<img>`（780x900 loaded）；63MB 视频（`GPT-Image2分享/鬼市迷影_7月7日_v2.mp4`）
  渲染为 `<video>`，duration 75s，readyState 4，可播放。
- **boot 无 toast**：`Failed to load plugins / did not activate / waiting for service`
  全为 false；console 零 error。
- **build + typecheck + test 全绿**：deepbuddy 55 条 / terminal-probe 5 条（品牌测试
  改为 name-only 断言，删 slogan 断言）。
- 未改 `~/.dsh/settings.yaml` 的 agent-default-model。
