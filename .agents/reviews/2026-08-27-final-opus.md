# DeepBuddy 终审报告（f76c741..b12be43，5 个提交）

- 日期 / agent：2026-08-27 / claude (opus)，终审
- 范围：`35155c3` / `8000053` / `4c4a3ad` / `73b5584` / `b12be43`，逐提交 diff + 全部改动文件最终状态逐行读
- 验证：`npx tsc -p plugins/deepbuddy/tsconfig.json --noEmit` 通过；`cd plugins/deepbuddy && npm test` → **65 pass / 0 fail**；host.js 的 500 路径用真跑的 Node 复现脚本核对（见 B1）；未运行 Electron 应用，需真机的条目已标注
- 只 review，未改任何代码
- 前提修正已接受：EDGE_STRIPS 位置正确（无需修）、绝对定位包含块是 root 的 **padding box** 且其边缘即窗口边缘。本报告不重复上一轮那两个几何错误。

---

## 结论：**收敛，可以合入**，但 B1 / B2 / B3 建议合并前处理

上一轮点名的 6 条（N1、N2、N4、N5、N6、N7）**全部落地**，其中 N1/N2/N4/N6 是干净的真修；N5、N7 修对了方向但各自引入一个新问题（B1、B4）。两条"误修"里 preset 那条改对了逻辑但**在当前构建里没有任何 UI 触点**（B8）；媒体重试那条真通了。dockAutoClosed / hostTerminated / generation 三个新状态机我逐路径推演过，**不变量都成立**，没有死锁、没有振荡、没有泄漏，只在 dockAutoClosed 的"用户如何拒绝"上有一个语义缺口（B2）。

| | 条数 | 明细 |
|---|---|---|
| 正确修复 | 8 | N1、N2、N3、N4、N6、N7、媒体重试、files generation 围栏 |
| 修对但带新缺陷 | 2 | N5 → B1、N7 → B4 |
| 修对但不可达 | 1 | preset drainStage → B8 |
| 新缺陷（本批引入） | 4 | B1、B2、B3、B4 |
| 新缺陷（本批放大的既有问题） | 3 | B5、B6、B7 |
| 明确未处理 | 7 | 见第四节 |

---

## 一、上一轮条目的逐条核对

### N1 隐形 spawn PTY → ✅ 真修

`ThreeColumnFrame.tsx:293` `visible={dock && view.id === active.id}`。dock 关闭时 keep-alive 列仍挂在 `:213` 的 `display:none` 下，但三个视图的 `visible` 都为 false：

- `TerminalView.tsx:330` `if (!visible || …) return` → `initialized.current` 保持 false，不会 `add()`，**不再有看不见的 zsh**；
- `FilesView.tsx:230` `if (visible && …) files.ensureRootLoaded()` → 不再后台预载文件树；
- `BrowserView.tsx:318` 同理 → 不再凭空建"新标签页"。

配套没有回归：`TerminalPane` 的 `visible` 变 false 只让 `fitAndResize`（`:169`）和 `scheduleFitAndResize`（`:181`）早退；dock 重开时 `:262-264` 的 `[visible]` effect 用 rAF 补一次 fit。✅

### N2 地址栏死回车 → ✅ 真修

`BrowserView.tsx:161-169`。Electron 且 webview 已挂载 → `webview.loadURL(next)` 命令式导航，绕开 React 的 `src` 属性 diff；webview 尚未挂载（`url === ''` 分支还没渲染 `<webview>`）→ 走 `setSrc` 给元素做首次种子。iframe 分支用 `setReload(+1)` 撞 key（`:280` `key={`${url}:${reload}`}`）保证每次回车都是真加载。原复现序列 a.com → /sub → 回车 a.com 现在会真导航。✅（新问题见 B3）

### N3 `writeDockWidth` 的无主 width 残留 → ✅ 真修

`layout-store.ts:267-271` 只写 `flex`。测试在 `plugin.test.mjs:389` 加了反向断言 `assert.equal(drag.dockStyle.width, '600px', 'the drag never touches the width key')`——正是上一轮建议的"给意图配一条最小断言"。

顺带确认没有留下 DOM/state 分叉：拖动期 `writeDockWidth` 用的 `clampDock(…, window.innerWidth, this.sideBudget())`（`:551`）与提交时 `reflow({dockPx:last})` 的二次 clamp 参数完全相同，幂等，`next === last`，React 不会因为"值没变所以不写"而与 DOM 分家。

`dockMax` 分支（`ThreeColumnFrame.tsx:223`）保留的 `width:'auto'` 现在是遗留键（没人再写 width 了），无害但已成噪声。

### N4 关闭已断线终端会先 spawn 再杀 → ✅ 真修

`host.js:799-806` 在 `terminalWss.on('connection')` 里、**Origin 校验之后**（`:834-843` 的 `registerUpgrade` 先跑）拦下 `intent=kill`，只碰 `terminals.close()`，不进 `attach()`，因此不经过 `resourceFor()` 的 spawn 分支。客户端 `TerminalView.tsx:130-137` 的 `bestEffortKill` 加了 5s 超时并在 `close` 里清掉定时器。鉴权没有被绕过。✅（残留窗口见 B7）

### N5 `res.destroy()` 发不出 500 → ⚠️ 改了，但结果是"截断的 500"，见 **B1**

### N6 `renderSlot('sidebar')` 传常量 → ✅ 真修

`ThreeColumnFrame.tsx:318` + `:365` 传 `sidePx`。代价是 `DeepBuddyRoot` 多订阅一个投影，侧栏拖动**提交时**（不是每帧）多一次根重渲染；`DeepBuddySidebar` 本身忽略这个 prop（`:66` 只解构 `renderSlot`），所以纯粹是契约保真。可接受。

### N7 主题只跟 attribute → ✅ 修对了，但代价见 **B4**

前提核实过：`theme-presenter.ts:58-65` 确实在 `body.setAttribute(DARK_ATTRIBUTE)` 之外用 `body.style.setProperty` 写 alias token，且 `ui/tokens.ts` 的 `--db-*` 是**穿透 `--dsw-alias-*`** 解析的（该文件头部注释第 19-24 行明说），所以 token-only 切换确实改变 `readTheme()` 的四个值。加 `'style'` 到 `attributeFilter` 是对的。

### N8 `fontFamily` 挂载时快照 → ❌ 未处理

`TerminalView.tsx:89` 仍单独 `getComputedStyle(mount).getPropertyValue('--db-mono')`，没进 `readTheme()`。当前主题不换字体，零影响；两处读法不一致的隐患照旧。

### 误修 1：preset busy 补跑 → ✅ 逻辑修对，但见 **B8**

`presets.ts:349-354` 的 busy 早退删掉了，忙时照样 stage；`applyStagedPreset` 用 `consumed`（`:375`）只消费自己带飞的那个 stage，await 期间新到的选择不会被清；`drainStage`（`:393-395`）挂在 apply 成功/失败、`makeDefaultPreset` 成功/失败（`:404`/`:407`）、`removePreset` 的 `finally`（`:433`）上。

我推演过三条链，都收敛、无死循环：
- staged=X 在飞 → 用户选 Y → `applyStagedPreset` 撞 busy 早退 → X 完成时 `consumed={}`（`state.stagedPreset===Y≠X`）→ `drainStage` → 接力 Y。✅
- `removePreset` 顶部的 `if (presetBusy) return` 在 `try` **之外**，不会误触 `finally` 里的 `drainStage`。✅
- `noteAgentPreset` 会触发 `mount()` 里 `list.subscribe` 的 `applyStagedPreset`，但 `stagedPreset===null` 时第一行就 return，不递归。✅

### 误修 2：EDGE_STRIPS → ✅ 按实测裁定为"无需修"，35155c3 只改注释

### 不完整 3：文本正文缓存永不失效 → ❌ 未处理

`store.ts:219-220`：`cached !== undefined && !(…'error' in cached)` → 成功读过的正文永远不再刷新，UI 上也没有刷新入口。agent 改完文件、用户再点还是旧内容。原场景一字未动。

### 不完整 4：媒体重试不可达 → ✅ 真修

`FilesView.tsx:138-147` 错误分支加了「重试」按钮直调 `store.openBinaryFile(path)`；`store.ts:242` 的缓存守卫对 `kind:'error'` 放行，所以按钮真的会发第二次请求。链路通了。✅

### files generation 围栏 → ✅ 本批质量最高的一处

`store.ts:77` 单调 `generation`，`watchSession`（`:141`）与 `dispose`（`:127`）各自自增，6 个 await 后写点（`:189`/`:201`/`:224`/`:228`/`:246`/`:277`/`:288`）全部改比对 `gen`。ABA 往返不再让旧 A 响应复活。`dispose()` 现在也失效在途响应 + `revokeMediaUrls()`，且 `App.tsx:104-107` 的 `ctx.effect` 真的会调它——不是死代码。

一处口径提示（不算缺陷）：`dispose()` 只 revoke 不清 `state.mediaBodies`，所以 dispose 后 state 里还留着指向已 revoke URL 的条目。store 随 fiber 死，没有消费者，无害；但如果将来有人给 store 加 `remount()`，这就是一个立刻复活的 bug。

---

## 二、新缺陷（按严重度）

### B1【P2】500 带着过期的 `Content-Length` 发出去，客户端看到的是截断响应而不是 500

`host.js:255-259`、`:780-784`

```js
if (res.headersSent) { res.destroy(); return }
res.writeHead(500)
res.end()
```

问题在 `writeHead(500)` **不清 `setHeader` 已经排好的头**。到达这个分支时，`streamMedia` 已经写过：
- `:246` `Content-Type: <mime>`、`:247` `Accept-Ranges`
- `:271` `Content-Length: <整个文件大小>`（在 Range 判断之前无条件设置）
- 206 路径还有 `:288-289` 的 `Content-Range` + 区间长度的 `Content-Length`

于是发出去的是 `500` + `Content-Length: 1048576` + **0 字节 body**。我用真跑的脚本确认了（Node v25.6.1）：

```
status 500 headers [["content-length","1048576"],["content-type","video/mp4"],…]
FETCH ERROR: TypeError terminated UND_ERR_SOCKET
```

客户端拿到的仍然是一次异常终止（Chromium 侧是 `ERR_CONTENT_LENGTH_MISMATCH`），而且 keep-alive 连接上的 HTTP 解析器会失步。注释自称"Actually answer when nothing was sent yet"，实际答的是一个不合法的 500——和上一轮"注释是意图不是验证"是同一个模式。

- 影响面：`size === null` 那条路（`:265-269`，没设 Content-Length）是干净的 500；有大小的两条路（绝大多数文件）都坏。
- 修法：`res.writeHead(500, { 'Content-Type': 'text/plain', 'Content-Length': '0' })`（writeHead 的显式头覆盖 setHeader），或先 `res.removeHeader('Content-Length'); res.removeHeader('Content-Range')` 再 writeHead。
- 最小断言：起一个 stat 得到大小、open 失败的文件（`chmod 000`），断言响应 `content-length === '0'` 且 body 读得完。

### B2【P2】`dockAutoClosed` 会抢走用户刚腾出的空间，而且用户没有任何手势可以拒绝重开

`layout-store.ts:159`、`:238-247`、`:340`、`:364`、`:379`

状态机本身是干净的——我核过一条关键不变量：**`dockAutoClosed === true` ⟹ `dock === false`**（置 true 的唯一地方 `:242` 同时把 `patch.dock = false`；重开分支 `:244-246` 立刻清标志；`openDock`/`closeDock`/overlay 退出三条用户路径都清）。所以不会振荡、不会与 `dockMax` 打架、重开后 `:254` 的 clamp 也会跑到（重开分支在 clamp 之前）。

问题是**语义**，两条：

**(a) 收起侧栏会把腾出的空间交给 dock。** 用实数走一遍（`GAP=10`、`CHAT_RESERVE=460`、`DOCK_MIN=416`、`DOCK_BREAKPOINT=1100`，`canSplitDock` ⇔ `vw ≥ 1100 && vw ≥ 906 + side`）：

1. `vw = 1250`，侧栏 268（side = 278，阈值 1184），dock 分栏开着；
2. 窗口缩到 `vw = 1150` → `onResize` → `1150 < 1184` → shell 收起 dock，`dockAutoClosed = true`；
3. 用户**收起侧栏**想给对话列腾地方 → `toggleSidebar` → `reflow({sidebar:false})` → `side = 0` → `canSplitDock(1150, 0)` 为真 → **dock 自己弹回来**，吃掉 416px。用户腾出的 278px 一分没落到对话列。

这与 `:191-199` 注释写死的收拢顺序（"dock 先走，侧栏后走"）方向相反：回程时先回来的应该是侧栏，不是 dock。

**(b) 没有"就让它关着"的手势。** dock 关闭时屏幕上唯一的 dock 控件是 `App.tsx:53-66` 的「打开停靠栏」（`dock && sessionStarted` 才隐藏），关闭按钮在隐藏列的头里（`ThreeColumnFrame.tsx:265`）。要清掉这个标志，用户必须 **⌘J 开 → ⌘J 关** 两次。在窗口反复缩放的现场（外接屏拔插、分屏调整），dock 会一次次自己回来。

**(c) 与侧栏不对称。** `onResize`（`:201`）在 `vw < 860` 时自动收侧栏，但**没有** `sidebarAutoClosed` 的反向补偿——窗口长回来侧栏不会自己回来。同一条"响应式规则 3"，dock 生效、侧栏不生效。要么两边都做，要么两边都不做。

**(d) 次要：标志跨会话存活。** `setView`（`:321`）把 `sessionStarted` 清成 false 时不清这个标志。序列「auto-close → 新建任务 → 拉宽窗口（此时 `dock` 悄悄变 true，但 `sessionStarted` 为 false 什么都不渲染）→ 任务开始」会让新会话一上来就带着一个用户没开过的 dock（并因此自动开第一个终端）。这一条与"dock 开关状态本来就跨新建任务保留"是一致的，所以只是 note，不单独计缺陷。

建议：把重开条件收紧为"仅由**窗口 resize** 触发的 reflow 才允许重开"（`reflow` 加一个 `origin` 形参），这样 (a) 直接消失，(b) 的暴露面也小很多。

### B3【P3】`webview.loadURL` 的**同步**抛出不在那个 `.catch` 的覆盖范围内

`BrowserView.tsx:161-163`

```js
void Promise.resolve(webview.loadURL(next)).catch(() => { /* did-fail-load 已兜底 */ })
```

`webview.loadURL(next)` 在 `Promise.resolve(...)` 求值**之前**执行，同步 throw 会直接穿过 `navigate()` 冒到 `onKeyDown`（`:221-223`），`.catch` 一点忙都帮不上。Electron 的 `<webview>` 文档明确写着方法只有在元素 attach 且 `dom-ready` 之后才可用，未就绪时抛 `Error: The WebView must be attached to the DOM and the dom-ready event emitted before this method can be called.`

触发窗口：`webviewRef`（`:138-140`）在元素**挂载时**就 `setWebview(node)`，早于 guest attach 完成。所以「输入 URL#1 回车（首次挂载 webview）→ 页面还在连 → 立刻输入 URL#2 回车」这一串里，第二次回车时 `webview !== null` 但 guest 可能尚未就绪。

- 未在真机复现，属于按文档推断；但无论窗口多窄，这个 `.catch` 都没做它看起来在做的事。
- 修法一行：`try { webview.loadURL(next) } catch { setSrc(next) }`，或整个包进 `void (async () => { … })().catch(…)`。
- 顺带：非 Electron 分支里 `setSrc(next)`（`:165`）是死写——iframe 用的是 `src={url}`（`:281`），`src` state 在 web 构建里没有任何读者。

### B4【P3】`attributeFilter` 加 `'style'` 后，每次拖分栏都会让所有终端全量重绘

`TerminalView.tsx:102-103` + `layout-store.ts:492`、`:507`

```js
themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'style'] })
```

`trackDrag` 在手势开始写 `document.body.style.cursor = 'col-resize'`（`:507`）、结束写 `= ''`（`:492`）。这两次都改的是 body 的 `style` **内容属性**，观察者照单全收 → 每个挂载中的 `TerminalPane` 跑一次 `readTheme()`（4 次 `getComputedStyle` 取值）并执行 `terminal.options.theme = readTheme()`。

`readTheme()` 每次返回**新对象**，xterm 的 options setter 不做深比较——赋值即触发 ThemeService 重算调色板并刷新整屏。终端上限是每会话 6 个，于是一次分栏拖动 = **最多 12 次终端全屏重绘**，正好落在 pointerdown 和 pointerup 这两个最不该卡的时刻，而颜色一个字节都没变。

修法（任选）：`readTheme()` 结果与上次逐字段比较，相同就不赋值；或者把拖动光标从 `body.style` 改成 body 的一个 class（tokens.ts 里已经有 `.dbdy-handle.dragging` 的先例）。

### B5【P3】`attach()` 把 message 监听提前了，close 监听没提前——await 期间死掉的 socket 会永久留在 `clients` 里

`host.js:568-604`

```js
socket.on('message', (raw) => { onMessage(raw) })   // ← 提前了，正确
const resource = await this.resourceFor(sessionId, termId)
resource.attach(socket)
…
socket.once('close', () => { resource.detach(socket) })   // ← 仍在 await 之后
```

这个提交的整条论证是"监听必须先于异步查找装好，否则早到的消息被静默丢弃"——同一条论证对 `close` 一字不差地成立，但只应用到了 `message`。如果 socket 在 `resourceFor` 期间就 close 了（`resolveSessionCwd` 走 RPC，`existing.closing` 那条还要 `await existing.exited`，可以是秒级），`once('close')` 永远不会触发，`resource.clients` 里就留着一个死 socket。

后果有限（`sendTerminalMessage` 有 `readyState === 1` 守卫，`dispose` 也会遍历 close），是 Set 的内存滞留而非功能错误。但它偏偏与 B7 是同一个窗口，且客户端的 `bestEffortKill` 恰恰在"主 socket 已死"时才触发。属于既有问题，被这次改动的论证放大了。

修法：`socket.once('close', …)` 提前到 `on('message')` 旁边，回调里判 `resource !== undefined` 再 detach，同时置一个 `closedEarly` 标志让 `attach` 拿到 resource 后立刻 detach。

### B6【P3】`early` 缓冲无上限

`host.js:571-573`。`resourceFor` 未决期间收到的所有帧都进 `early` 数组，**校验（64KB/帧、cols 范围）只在回放时才跑**。`WebSocketServer` 的 `maxPayload: 64 * 1024`（`:791`）只限单帧，不限帧数；`resourceFor` 里 `await existing.exited` 那条可以等很久。同源客户端不会这么干，但这是一个真正无界的队列。给 `early` 加个 `if (early.length < 64)` 的上限即可。

### B7【P3】kill-intent 对"正在 spawn 中"的资源是静默 no-op

`host.js:803` → `DeepbuddyTerminalManager.close`（`:607-619`）只查 `this.resources`。而 `resourceFor`（`:544-570`）在 `await resolveSessionCwd(...)` 期间，key **既不在 `resources` 也不在 `pending`**（`pending.set` 在那个 await 之后）。

序列：客户端 socket 连上 → host 进 `attach` → `resolveSessionCwd` 在飞 → socket 断（网络抖动）→ 客户端 `socketRef` 归 null → 用户点 × → `bestEffortKill` 新连接 → `terminals.close()` 查不到 key → **静默返回，socket.close(1000, 'kill delivered')** → 随后原来的 `resourceFor` 落地，spawn 出一个 PTY 并 attach 到一个已死的 socket 上 → 这个 PTY 活到 `session/disposed`，并占掉 `TERMINAL_MAX_PER_SESSION = 6` 的一个名额。

窗口窄但真实，而且协议名义上告诉客户端"kill delivered"。修法：把 pending 的登记提到 `resolveSessionCwd` 之前（或维护一个 `killIntents: Set<key>`，`resourceFor` 落地时检查并立刻 dispose）。

### B8【P3】preset 的 busy/stage 链修对了，但**当前构建里没有任何调用点**

`presets.ts:349`（`selectPreset`）、`:398`（`makeDefaultPreset`）、`:419`（`removePreset`）、`:448`（`startCreatorSession`）、以及 `state.presetBusy`——全仓 grep：

```
grep -rn "presetBusy|selectPreset|stagedPreset|makeDefaultPreset|removePreset|startCreatorSession" \
  plugins/deepbuddy/src plugins/deepbuddy/tests | grep -v src/client/dsh/presets.ts
→ 无匹配
grep -rn "\.presets\b" plugins/deepbuddy/src/client --include=*.ts --include=*.tsx | grep -v dsh.presets
→ 无匹配
```

`PresetPlane` 在 `App.tsx:87` 构造、`:98-101` mount，但 `deps.presets` 没有任何组件读它。因为 `stagedPreset` 只能被 `selectPreset`/`startCreatorSession` 写，两者都无触点，`applyStagedPreset` 在真实运行里**永远在第一行 return**。

这意味着：
1. 上一轮报告里那条"用户在 busy 期间点另一个模式、选择被丢弃"的原缺陷，在现在的 UI 里同样触发不了——不是本轮修好的；
2. 本轮的 drainStage 改动**没有任何可执行的验证方式**，测试里也没有对应断言（`presets:` 开头的 4 个用例测的全是 `selectablePresets`/`canSelectPreset` 这类纯函数）；
3. 逻辑我读过、推演过、认为正确（见第一节），但它应当被记成"待模式选择器 UI 落地后才成立的修复"，不能算进本轮的已验证条目。

建议：要么给 `PresetPlane` 补一个纯 store 级的单测（构造一个假 `dsh`，断言 busy 期间 `selectPreset` 后 `stagedPreset !== null`、飞行结束后接力），要么在提交说明里注明这条是前置改动。

### B9【P3】主 socket 卡在 CONNECTING 时，× 仍然无限等

`TerminalView.tsx:158-163`。5s 超时加在了 `bestEffortKill` 的 killer socket（`:133`）上；主 socket 卡在 CONNECTING 时，`closeResource` 只挂 `open`/`close` 两个监听，没有超时。要等到 TCP 自己超时（macOS 约 75s）Tab 才会从账本里消失，期间 `closeRequested` 已置位，第二次点 × 是死键。提交说明的"不再有悬挂 CONNECTING 连接"只覆盖了 killer 那一半。

---

## 三、新状态机的逐路径核对（无缺陷，记录推演结论）

### `TerminalView` 的 `hostTerminated` / `closeRequested`（`:112-165`）

| 场景 | 路径 | 结论 |
|---|---|---|
| host 发 `error`（如 terminal-limit）后点 × | `:217`/`:222` 置 `hostTerminated` → `:119` 直接 `onClosed` | ✅ 错误态 Tab 可关，原缺陷消失 |
| host 发 `closed` 后点 × | 同上，**不**再发 kill | ✅ 正确，host 已经杀过 |
| PTY 自然 `exit` 后点 × | `exit` 不置 `hostTerminated` → 发 kill → host `close()` 走 `status.kind==='exited'` 分支 `dispose()+delete` | ✅ 回收干净 |
| socket 处于 CLOSING(2) | `:139` 只判 null/CLOSED → 落到 `killAndClose` → 非 OPEN → `bestEffortKill` | ✅ 有覆盖 |
| 重复点 × | `:116` `closeRequested` 幂等 | ✅ |
| 重启按钮（`:277`）在 closed/error/exited 态 | `restart` 在 effect deps 里 → 整个闭包重建，两个标志归零 | ✅ |
| 断线重连 | `:231` 三条件都要为假才重连 | ✅ 用户关闭/host 终结都不会自动重连 |

`hostTerminated` 在用户关闭路径上也被置 true（`:125`）——语义上有点重载（"host 终结了"和"我已经代表用户发了 kill"合用一个位），但两个消费点（`:192` connect 守卫、`:231` 重连守卫）要的都是"别再连了"，行为正确。

### `LayoutStore.reflow` 的 clamp 一致性（`:233-262`）

关键改动是 clamp 加了 `&& (patch.dock ?? this.state.dock) && !dockMax`。核对"每一条进入**正在分栏渲染**的路径都会 clamp"：

| 入口 | 是否 clamp | 结论 |
|---|---|---|
| `openDock` 分栏开（`:357-359`） | 显式 `clampDock` | ✅ |
| `openDock` overlay 开 | 不 clamp，原样保留偏好 | ✅ 符合"休眠偏好"意图 |
| `toggleDockMax` 退出全屏（`:385`） | 走 `reflow({dockMax:false})`，此时 `dockMax=false`、`dock=true` → clamp 跑 | ✅ |
| `toggleDockMax` 在窄窗退出（`:377-381`） | 直接关 dock，不需要 | ✅ |
| `dockAutoClosed` 自动重开（`:244-246`） | 重开分支在 clamp 之前，`patch.dock` 已为 true → clamp 跑 | ✅ |
| 拖动提交 / `resetDockWidth` | dock 必然开着 | ✅ |
| dock 关着 / 全屏时缩窗 | 跳过 clamp | ✅ 这正是本次要修的（650→416→594 归零） |

测试 `plugin.test.mjs:461-475` 双向覆盖了这两条（关闭态跨缩窗、全屏态跨缩窗往返均保 650），`:445-457` 双向覆盖了自动重开 vs 用户关闭。断言是真行为断言，不是字符串匹配。✅

一个遗留的小坑（非本轮引入）：首次开 dock 若发生在窄窗且走 overlay，`dockPx` 会被 `dockDefault` 定死在 416（`:359`）；之后窗口拉宽退出全屏时 `reflow` 会 clamp 回 594，能自愈，但"第一次开"的默认值取决于当时的窗口。可接受。

### `FilesStore.generation`（见第一节）✅

---

## 四、明确未处理（确认过，非遗漏判断）

1. **文本正文缓存永不失效** — `store.ts:219-220`，UI 无刷新入口。上一轮报告的主场景原封不动。
2. **N8 fontFamily 挂载时快照** — `TerminalView.tsx:89`。
3. **P2-5 会话切换后 PTY 孤儿** — `TerminalView.tsx:246-259` 卸载只 `socket.close()` 不发 kill，fence 换会话时旧 PTY 留到 `session/disposed`。N1 修好之后踩到 6 个上限的概率下降了，但 B7 又开了一条新的泄漏缝。
4. **P3-5 官方类名哈希耦合** — `tokens.ts`，无失效探测。
5. **P3-8 媒体路由无 Origin/CORS 口径** — `host.js:770-786` 与终端 upgrade 的 Origin 校验仍不一致。
6. **`dsh/files.ts:87-95` 的 3 秒不可取消重试** — 会话真的不存在时每次展开目录卡满 `RETRY_LIMIT × RETRY_MS`。
7. **`useLayoutSelection` 渲染期写 ref** — `layout-store.ts:573-574`，并发模式撕裂风险照旧。

---

## 五、终审判定

**收敛，建议合入**，理由：

- 三轮下来 P0/P1 全清：能杀宿主进程的媒体流 error、跨会话回写、隐形 spawn PTY、地址栏死回车，四条最重的都堵死了，且每条都能在源码里指到具体守卫；
- 三个新状态机（`dockAutoClosed`、`hostTerminated`/`closeRequested`、`generation`）我逐路径推过，**不变量都成立**，没有一条是"看起来对但推演会崩"的；
- 测试第一次开始给意图配反向断言（`width` 不被触碰、自动重开 vs 用户关闭双向、休眠偏好跨缩窗），typecheck 干净，65/65 通过；
- 35155c3 主动纠正了上一轮 reviewer（我）给错的几何结论，并用真机 CDP 数据落了证据——这是本批最健康的一个信号。

合并前建议处理的三条：**B1**（一行 writeHead 参数，客户端拿到的是坏响应）、**B2**（收侧栏被 dock 抢空间 + 无法拒绝重开，是用户能天天碰到的交互）、**B3**（一行 try/catch，那个 `.catch` 现在是装饰）。其余 B4–B9 可以进下一轮。

最后记一条方法论，接上一轮那条"注释是意图不是验证"：**本轮四条新缺陷里有三条（B1、B4、B8）的共同形态是"改动本身是对的，但它的副作用/前提没有被同一次改动覆盖"**——B1 改了状态行没管已排队的头，B4 加了监听源没管这个源上的噪声写入，B8 修了一条没有调用者的链。这三类都能被一个问题挡住：*这次改动新增的那条路径，谁会走它，以及它还会顺带影响谁走过的路径？*
