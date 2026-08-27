# DeepBuddy 只读深度体检报告

- 日期 / agent：2026-08-27 / glm-5.3-flash
- 范围：git ea6cd65..HEAD 之后的全量 client 侧代码精读（shell / features / app / dsh 适配 / ui tokens / apps/desktop/main.js / tests），重点排查「绕过 React 手写 DOM 被 React 清掉」同类模式。
- 方法声明：全部结论基于源码逐行阅读 + `grep '\.style\.|addEventListener|querySelector|getBoundingClientRect|classList'` 对手写 DOM 操作做全量扫描定位；未运行任何会写入仓库的命令。标注 `[INFERENCE]` 的条目未经真机复现。

---

## P0

未发现。无数据持久化写路径、无崩溃级缺陷证据（PTY kill 权在 host，客户端不越权）。

## P1 功能错误

### P1-1 MediaPreview：blob URL 在 store 仍缓存时被 revoke，关标签重开同一媒体必然渲染失败（条件：base64 兜底通道）

- 位置：`plugins/deepbuddy/src/client/features/files/FilesView.tsx:132-139`（卸载即 `URL.revokeObjectURL`）、`features/files/store.ts:184-224`（`openBinaryFile` 第 187 行早退：`mediaBodies[path] !== undefined` 就不再请求）。
- 链路：
  1. 打开图片 A → store 解码出 blob URL 存入 `mediaBodies[A]`；
  2. 关闭 A 的 Files 标签 → MediaPreview 卸载 → effect cleanup **revoke 了 blob URL**，但 store 里的 `{kind:'url', url}` 原样保留；
  3. 再次点击 A → `openBinaryFile` 因已有缓存直接 return → `<img src>` 指向已 revoke 的 URL → 空白图。
- 触发序列：开会话 → Files 点开一张图（走 base64→blob 兜底，即 host 媒体路由未注册/不可达时）→ 关掉它的标签 → 重开同一张 → 图片永远打不开，只能靠切会话清缓存救回。
- 严重度注记：DSH host 注册了媒体路由时走 HTTP url 分支，`revokeObjectURL('http://…')` 是无害 no-op，此 bug 不触发；桌面版（same-origin http）大概率命中可用分支，故实际暴露面收窄，但代码上两条分支共用 `kind:'url'` 类型、revoke 无差别执行，属于埋雷。
- 正确修法方向（二选一）：revoke 同时从 store 删除该条目；或把「资源所有权」收进 store（LRU/引用计数），view 只消费。

### P1-2 Sidebar 手写宽度与 dock 同病不同命：收起再展开，用户拖出的宽度静默归位 268px

- 位置：`shell/ThreeColumnFrame.tsx:323`（`{sidebar && (...)}` —— 收起即**卸载**整列）；`shell/layout-store.ts:516-525`（`startSideDrag` 直接写 `el.style.width`）、`527-530`（`resetSideWidth` 是唯一会写默认值的地方）、`56-60`（DeepBuddySidebar 的 style prop 是常量 `width: METRICS.sidebar`）。
- 与刚修过的 dock 失钉 bug 完全同类：拖拽写 DOM 内联宽度 → React 重挂载（此处是 unmount/remount，比 style diff 更彻底）→ 元素重建，style prop 回写 268px。dock 有 `dockPx` + `repinDock()`（layout-store.ts:154, 257-264）补丁，sidebar 没有任何对应物——`sideWidth()`（225-230）读不到内联值时也只是默默回落 `SIDEBAR_DEFAULT`，不告警。
- 触发序列：把侧栏拖到 380px → 点「收起侧边栏」→ 点「展开侧边栏」→ 侧栏回到 268px，无提示。
- 附带不一致：正因为 remount 后丢宽度，`canSplitDock/clampDock` 的 `sideWidth()` 参与的全部几何都随之漂移；而且这不是小概率路径——窄窗口下窗口 resize 自动收起侧栏（`onResize`, layout-store.ts:201）也会触发同一条链，用户没主动碰过侧栏也会遇到「拖过一次之后宽度莫名变了」。

## P2 边界 / 竞态

### P2-1 侧栏开合不触发 `clampDockWidth`：展开侧栏后 dock 可把会话列压穿 460px 保底

- 位置：`shell/layout-store.ts:329-331`（`toggleSidebar` 只 patch）；`196-203`（`clampDockWidth` 只挂在 window resize 上）；`geometry.ts:39,42,91-95`。
- `clampDock` 的区间可以整体塌缩：`min = max(vw*0.30, 416)` 且 `max ≥ min`。例如 vw=1150、侧栏收起时 `canSplitDock` 为 true 但窗口刚够，dock 被钉在 416px（floor 击穿 1/3 上限，注释自认）；此刻展开侧栏（+268+10 gap），会话列只剩 1150−20−278−416 ≈ 436px < `CHAT_RESERVE` 460。全程没有任何代码路径重新钳制 dock——直到下次 window resize 或 dockMax 翻转才自愈。
- 违反设计意图 §2「conversation column is never squeezed under its reserve」。侧栏拖拽结束时有 `clampDockWidth()`（524），唯独开合这个同样改变预算的动作没有。

### P2-2 FilesStore 三处异步回写缺会话围栏校验：慢响应把旧 workspace 数据写进新会话状态

- 位置：`features/files/store.ts:139-161`（`loadDir`）、`170-181`（`openFile`）、`184-223`（`openBinaryFile`）。三者都在 await **前**捕获 `watchedId`，await **后**不做 `this.watchedId === id` 校验就直接 `setState`。
- 触发序列：点开某个大目录（listDirectory 慢）或大图（readBinary 慢）→ 立刻切换 workspace 会话（栅栏同步清空 `fsChildren/mediaBodies`）→ 旧请求 resolve → 旧会话的 children 被写进新树的同名 key、旧会话文件的 body/base64 写进新 state。轻则脏树/多余内存；最坏情形：新旧两 workspace 存在同相对路径文件时，媒体预览把**旧 workspace 的图渲染成当前会话的文件**。
- 布局侧（`fenceTabs` + remount）已经做对了，这是数据平面漏掉的对称的一半。对比 `SessionList` 订阅端 `onSessions`（116-121）用 `watchedId` 做了同步围栏，异步出口却没收口。

### P2-3 session-started 绑定未水化时只 poll 一次 microtask：dock 开关可能永久缺席 `[INFERENCE]`

- 位置：`dsh/adapter.ts:322-334`。`ctx.sessions.binding(cur)` 未就绪时，仅在 `queueMicrotask` 里重试一次；注释自己写了「the session hydration does not re-notify `list`」。microtask 几乎必然还早于网络往返 → `started=false` 且此后没有任何再触发点（list 不再 notify、session.subscribe 又没挂上）。
- 表现：web 页面冷启动/刷新，current 直接是一个已开始的会话时，「打开停靠栏」按钮可能不出现，直到任意一次 session 快照变化侥幸路过第二次判断分支（`cur === watchedSessionId && … && sessionOff === undefined`）才解锁。
- 为什么是 INFERENCE：取决于 runtime 是否保证「binding 可解析前 list.snapshot.current 不投放」。若是同步 hydrated 则永不触发。建议真机复测：开着任务中途刷新页面，看 header 工具簇里 dock 图标是否稳定出现；若复现，修法是把 microtask 换成对 binding 出现的短轮询（或监听 sessions 服务的就绪信号），一次 microtask 覆盖不了任何真实 IO 延迟。

### P2-4 xterm 在浅色主题下永久保留深色屏：theme/computed style 只在 mount 读一次

- 位置：`features/terminal/TerminalView.tsx:69-88`。`new Terminal({ theme: { background: getComputedStyle(...).getPropertyValue('--db-void') … } })` —— 首建时的 token 字面量被 xterm 固化在 canvas 上。
- 触发序列：深色主题开终端 tab（keep-alive 存活）→ 设置里切浅色 → 整个 UI 变纸白、终端仍是 `#0e0e10` 黑块（浅色下 `--db-void` 应为 `#ffffff`，tokens.ts:176-188）。反向同理。须重开标签（fence/remount/restart 按钮）才恢复，keep-alive 设计恰好把这个过期状态最大化保留了。

---

## P3 可维护性 / 低危边界

### P3-1 LayoutState 的 `view` / `title` 是死状态，且带一个隐性副作用

- `shell/layout-store.ts:48-92` 定义、`311-327` 实现，但全仓 grep 显示唯一调用方是 `Chat.tsx:22` 的 `setView('chat')`，而 `state.view`/`state.title` **没有任何渲染消费者**（主列恒由官方 ConversationRoot 占据）。每次 `setView` 还会顺手 `patch({ sessionStarted:false })`——点「新建任务」时这是与 `syncSessionStarted` 平行的第二份真主写同一个事实，正是 AGENTS.md「一份可变状态只有一个 Owner」的点名的反例（虽目前被官方服务后写覆盖兜住）。建议整体退役这组字段与方法。

### P3-2 Terminal 关闭竞态：CONNECTING 期点 ×，连接失败时标签永卡「正在连接…」

- `features/terminal/TerminalView.tsx:98-113`：CONNECTING 时关闭依赖 `'open'` 一次性监听器去补杀；若 socket 从 CONNECTING 直接走到 CLOSED（拒绝/超时），`killAndClose` 永不执行、`onClosed(termId)` 不回调 → tab 留存、界面停在 connecting。用户再点一次 ×（此时 readyState=CLOSED 走 101-104 分支）可解，故仅低危。顺带：once 监听器在无错路径之外没有清理出口。

### P3-3 Terminal 断线重连无退避上限，且 `dbwarn` 常开刷屏

- `TerminalView.tsx:176-179`：固定 800ms、无限次、后台隐藏 tab 也照常重连（keep-alive 的合理推论但没有封顶）；host 长时间不可达时 console 以常开级别每 800ms 一条，反而淹没 field report 里真正有用的一条。建议指数退避 + 上限/静默窗。

### P3-4 ⌘J 冷启动空操作

- `layout-store.ts:205-216` 的 keydown 调 `toggleDock()` 不带 fallback；`state.pane` 为 null（本次启动从未开过 dock）时 `toggleDock`（381-388）直接返回——快捷键第一次按永远是哑弹，直到用户用可见按钮开过一次。头部按钮（App.tsx:62）传了 `firstView`，两处不对称。

### P3-5 Browser 小项一组

- **刷新按钮在失败态失效**：`did-fail-load` 置 `failed=true` 后 `<webview>` 被 Refusal 卡片替换、`webview===null`，刷新 onClick 里 `webview?.reload()` no-op，只靠 `setFailed(false)` 重挂一个全新 webview（历史后退丢失）。BrowserView.tsx:192-197 + 222-230。
- **iframe fallback 对 X-Frame-Options 盲**：被拒嵌入的 iframe 同样触发 `onLoad`（236 行还会把 failed 重置 false），web profile 下拒绝站点呈现纯白页而非「拒绝嵌入」卡片。仅影响非 Electron 退化路径。
- 地址栏 blur 后 Enter 输入残留未提交编辑也可能被 persist（119-122 setInput 即持久化 input 草稿），跨 keep-alive 存活属预期与否需要产品确认——列此存疑，不算缺陷。

### P3-6 会话栅栏清缓存不 revoke → 小额确定性泄漏

- `store.ts:123-127`：`watchSession` 把 `mediaBodies` 置空但跳过了 blob URL 回收；只有当时正挂载着的 MediaPreview 的 cleanup 兜底（FilesView.tsx:136-138）。凡「开过图又关掉标签」之后再切会话，那个 blob 就此泄漏（另一面也解释了为何 P1-1 反而难自发暴露）。

### P3-7 脆弱隐式约定清单（均在代码里自认，但值得列册管理）

- **官方类名子串匹配**：`ui/tokens.ts:293-299`（`[class*="_headline"]`、`_sessionLogButton` 隐藏官方元素）与 `307-314`（重塑官方 header 几何）。注释明言「officials are locked at 0.1.1-rc.2, revisit on upgrade」——这是把 DSH 锁死在一个已知版本的口头契约，升级即静默破相（不报错，UI 变形）。建议至少加一条启动时的结构断言（找不到目标节点就 dbwarn）把静默变响亮。
- **字符串/正则匹配式测试**：`tests/plugin.test.mjs:187-213` 对源码逐行正则（含 `\}, 80\)` 这种魔法数断言）、`613-634` 数构建产物里 `"drag"` 出现次数必须恰为 3。任何无行为变化的等价重写都会打红测试；反之它们也不证明行为。测试名宣称「use display keep-alive」，实际锁的是实现文本。
- **paint/app-region order 依赖**：`ColumnFrame.tsx:100-102` PANEL 注释「Region collection is paint-ordered」与 `ThreeColumnFrame.tsx:340-350` 主列负 z 拖拽条（`pointerEvents:'none'`）双双押注 Electron 对 app-region rect 的收集规则——该规则历史上随版本漂移（pointer-events:none 的 drag 区是否吸附点击曾是长期 issue）。建议在 Electron 升级 checklist 里固定一条「52px 带内点 div 型交互元素（如审批行的非常规控件）回归项」。`[INFERENCE]`

### P3-8 冗余与小开销

- FilesView 点击文件双 patch：`onOpenTab` + `onFocusTab`（FilesView.tsx:240-244）最多两次 store 通知，tab 已开时尤显——`openTab` 本可接受「附带 focus」语义一步到位。
- 媒体文件双重拉取：`onOpen` 恒调 `openFile`（text RPC），MediaPreview 再调 `openBinaryFile`（binary RPC），同一文件两次过网。可在 FileBody 判定为媒体时跳过 text 读取。
- `slots.inject` 两处丢弃返回的退订函数：App.tsx:154-157、dsh/adapter.ts:292-295——插件 fiber teardown 时这些注入不会回收（当前应用生命周期≈进程生命周期，实害为零，但契约上是漏的）。

---

## 专项排查结论：手写 DOM 绕过 React 的全量清单与判定

grep 全量扫描后的完整清单及安全判定：

| 位置 | 写什么 | 判定 |
|---|---|---|
| layout-store `writeDockWidth/repinDock/clampDockWidth` | dock 内联宽 | ✅ 已由 repin layout-effect 覆盖 mount + dockMax 两类 commit；split↔split 的普通重渲染因 style prop 值恒等不会被 diff 清除 |
| layout-store `startSideDrag` | sidebar 内联宽 | ❌ **P1-2**：unmount/remount 直接洗掉，无 dockPx 对应物 |
| layout-store `freezeDockEmbeds/thaw` | island overflow + embed 宽度 | ✅ 捕获/恢复对称；React 侧 overflow 键恒为 hidden，diff 不触碰 |
| layout-store `trackDrag` | body cursor、handle class | ✅ finished 单闸防重入；capture 元素被移除时 lostpointercapture 自愈 |
| theme-presenter | html/body 属性、token 变量、meta | ✅ 在 React 树外，自带 retraction 集，dispose 对称 |
| TerminalPane/EmbedRefusal | 无 DOM 直写（xterm/webview 内部除外） | ✅ |
| kit Popover | 翻转经 setState，零 DOM 直写 | ✅ |

同族问题只剩 sidebar 一处漏网（P1-2）；freezeDockEmbeds 未发现竞态实害（thaw 写 detached 节点无害）。

## 验证过的健康面（点名，避免误伤）

- 会话栅栏单一化（App.tsx:108-118 → `fenceTabs` + `onSessionFence`）：订阅回调同 tick 先重置模块计数器（terminalCounter/browserCounter）再让 React 渲染，顺序正确；handoff 所述「browser 跨 workspace 残留」确已被三条清理链完整封堵。
- `trackDrag` 五条终止路径（up/cancel/lost capture/blur/capture 异常）经代码逐条核对均收敛于同一 `finish`，监听器成对移除。
- `useLayoutSelection` 的 Object.is 抑制 + memo 化的 InspectorViewMount/BrowserTabMount 组合成立：页title更新只会波及对应单 pane。
- Popup/Tabs 等 KIT 控件均为原生 `<button>`，被 tokens.ts:282-286 的全局 no-drag 豁免规则覆盖，未见 drag 区吞交互死角（dbdy-handle 显式 no-drag；`.dbdy-overlay` 显式 no-drag）。
- 终端 keep-alive 语义与 PTY 所有权划分正确：pane 卸载不发 kill，kill 只发生在显式关 tab（host 持有至 `session/disposed`，与 handoff 记录一致）。

## 总体架构健康度评价

这套 client 代码的质量在水准之上：分层纪律（Definition/catalog/shell 零业务分支、DSH ABI 关进 adapter、module-level 资源统一受栅栏管辖）是真的被执行而不是写在文档里；命令式的残余被压缩到了「布局几何」这一小块并配有说明性注释和针对性测试；最近一次 dock 失钉修复选择了「记住数值 + layout-effect 补钉」而非引入额外响应式状态，是符合其架构趣味的正确解法。

风险结构也很典型：**命令式岛屿与声明式 React 之间的接缝是它唯一的系统性软肋**——dock 修好了，sidebar 仍在同一条沟里（P1-2）；xterm 的快照式主题（P2-4）和文件的异步回写无围栏（P2-2）本质上都是「捕获了易变环境的一次快照，之后没人负责让它过期」。此类问题不会出现在单元测试里，因为它们全是时序与生命周期交界处的行为，而现有测试恰恰以锁定实现文本为主（P3-7），对真正的回归模式覆盖薄弱。

建议的优先动作按性价比排序：(1) 给 sidebar 补上与 dock 对称的宽度持久化（几十行内）；(2) FilesStore 三处 async 回写补 `watchedId === id` 校验；(3) 处理媒体 blob 的所有权归属（同时消掉 P1-1 与 P3-6）；(4) 给 `clampDockWidth` 接上侧栏开合时机；(5) 把 tokens.ts 里对官方类名的结构性依赖变成启动时可诊断的断言。完成前三项后，这套壳可以称得上可以长期交付的状态。
