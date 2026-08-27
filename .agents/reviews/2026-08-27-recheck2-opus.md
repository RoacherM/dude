# DeepBuddy 修复复审报告（4117ba3..f76c741）

- 日期 / agent：2026-08-27 / claude (opus)
- 复审范围：5 个提交（51226de / 950fac2 / 381fdb6 / 9838392 / f76c741），逐行读了全部改动文件的最终状态
- 验证手段：源码逐行核对；`npx tsc -p plugins/deepbuddy/tsconfig.json --noEmit` 通过；关键外部行为在 `@xterm/addon-fit@0.11.0` 产物、`@deepseek-ai/dsh-host-webserver` 里核对过（下文标注"已核对"）。**未运行应用**，需真机验证的条目单独标注。
- 只 review，未改任何代码。

## 编号对照（避免误会）

你信里点名的三条，在我原报告里的编号是：

| 你的说法 | 原报告编号 | 位置 |
|---|---|---|
| brand inject disposer | **P2-9** | `adapter.ts:292`（P2-4 是 sessionStarted hydrate 竞态，也修了） |
| xterm 主题跟随 | **原报告没有这条** | 是本轮自选增补，我按新增功能审 |
| preset busy 补跑 | **P3-10 第 5 小条** | `presets.ts:363` |

## 结论摘要

| 分类 | 条数 | 明细 |
|---|---|---|
| 已修（正确） | 16 | P0-1、P1-1、P1-2、P1-3、P2-1、P2-2、P2-3、P2-4、P2-6、P2-7、P2-9、P3-3、P3-6、P3-7、P3-9、P3-10(⌘J/双 patch/无用 import) |
| 误修 / 不完整 | 4 | **P2-8（边缘条位置算错，等于没修）**、**P3-10 preset 补跑（死代码，真正的丢弃路径没碰）**、P3-2（只修了错误重试，成功缓存仍不失效）、媒体读取失败重试在 UI 上不可达 |
| 新缺陷 | 8 | N1 不可见自动 spawn PTY（P1）、N2 地址栏回旧 URL 失效（P1）、N3~N8 见下 |
| 未处理（原报告里的建议项） | 5 | P2-5、P3-5、P3-8、files.ts 3s 重试、useLayoutSelection 渲染期写 ref |

---

## 一、已修（核对通过）

### P0-1 媒体流 error 无监听 → ✅ 正确修复
`host.js:253-259` 抽出 `streamFile()`，三个调用点（`:264`/`:272`/`:286`）全部改道，`stream.on('error')` 就位；`:769-773` 给 `streamMedia(...)` 补了 `.catch`。两条能杀进程的路径都堵上了。

### P1-1 webview 受控 src → ✅ 修复（但引入 N2，见下）
`BrowserView.tsx:128` 新增独立的 `src` state，只有 `navigate()`（`:155`）写它；`sync()`（`:167-177`）只更新 `input`/`url`/`history`。`did-navigate-in-page` 不再触发整页重载，SPA 页内路由的状态保住了。

### P1-2 files 跨会话回写 → ✅ 正确修复
`store.ts:143-145` 的 `fresh(id)` 守卫覆盖了全部 5 个 await 后的写点（`:166`、`:178`、`:202`、`:206`、`:223`、`:265`），连 base64 解出的 blob 都在 `:254-257` 判定过期后立刻 revoke，没留悬挂 URL。这是本轮质量最高的一处修复。

一点口径提示（不是缺陷）：`fresh()` 比的是 `watchedId === id`，A→B→A 快速往返时旧响应仍算"新鲜"。因为是同一 session 同一工作区，写进去的数据依然正确，只是会把用户还没展开的目录填回来。要绝对严谨得换单调 generation。

### P1-3 openBinaryFile 缺 catch → ✅ 修复
`store.ts:264-272`。不再有 unhandled rejection，失败落成可渲染的 `{kind:'error'}`。（但 UI 上重试不可达，见二-4。）

### P2-1 侧栏拖宽挤压对话列 → ✅ 修复，代价明确
`layout-store.ts:225-241` 的 `reflow()` 把"分栏放不下就关 dock"从只在 window resize 生效，提升为所有预算变更路径共用。`toggleSidebar`（`:308`）、`startSideDrag` 提交（`:504`）、`resetSideWidth`（`:508`）、dock 拖动提交（`:524`）、`resetDockWidth`（`:529`）全部走它。460px 保留宽的不变量现在真的全路径成立。

行为变化需知会用户：1200px 窗口把侧栏拖到 380，松手瞬间 dock 会**直接关闭**（不是变窄）。账本保留，重开时因为 `canSplitDock` 为假会变成全屏浮层。这是设计里既有的收拢顺序，只是第一次出现在拖动路径上。

### P2-2 侧栏宽度收起后丢失 → ✅ 修复
`sidePx` 进 state（`:76`、`:110`），`ThreeColumnFrame.tsx:70/76` 渲染它。折叠/展开是 unmount，但宽度在 store 里，重新挂载即恢复。

### P2-3 repinDock 是补丁不是不变量 → ✅ 修复，模型收敛了
`repinDock`/`clampDockWidth`/`sideWidth` 全删（grep 无残留），dock 宽度改为 `ThreeColumnFrame.tsx:224` 从 `dockPx` 渲染。拖动期仍走 `writeDockWidth` 直写 DOM，松手提交一次——正是我建议的模型。`dockMax` 分支保留显式 `width:'auto'`（`:220`），所以 split↔max 往返时 React 会把 width 键清干净，不会残留。

我原报告里担心的"React 重渲染会打断拖动"不成立：拖动期间 `dockPx`/`sidePx` 未提交，React 的 style diff 前后值相同就不写 DOM，内联值安全。✅

### P2-4 sessionStarted hydrate 竞态 → ✅ 修复
`adapter.ts:336-351` 把一次 `queueMicrotask` 换成 100ms×50（5s 上限）轮询，`:329-332` 和 `:359` 两处都清了定时器，不泄漏。轮询命中后 `:348` 回调重入，走的是 `sessionOff === undefined` 那个子句正确补订阅——我推演过这条重入路径，没有死循环也没有重复订阅。
小建议：`tries >= 50` 放弃时静默，加一条 `dbwarn` 会让"dock 开关没反应"这类现场报告可定位。

### P2-6 CONNECTING 期间关闭标签页无效 → ✅ 修复
`TerminalView.tsx:138-143` 补了 `close` 监听（与 `open` 共用 `finished` 幂等位），`:109` 的 `if (manuallyClosed) return` 挡住了重复点 × 叠加监听器。连不上的 socket 现在一定会把标签页从账本里摘掉。

### P2-7 桌面进程组回收 → ✅ 修复
`main.js:158` 加 `detached: true`，`killChild` 的 `process.kill(-child.pid)` 这才真正指向子进程自己的组，PTY 孙子进程随退出一起走。
副作用提醒（不算缺陷）：detached 后子进程脱离了 Electron 的进程组，从终端跑打包版时 Ctrl-C 不再连带杀掉 dsh。dev 模式不 spawn，所以影响面很小。

### P2-9 brand 槽注册没挂 effect → ✅ 修复
`adapter.ts:292-295` 包进 `ctx.effect(..., 'deepbuddy: brand mark')`，与同文件其它注册口径一致，disposer 不再被丢弃。

### P3-3 媒体 blob revoke effect 捕获 null → ✅ 修复，且方向正确
所有权整体上收到 store：`FilesView.tsx` 删掉那个 effect，`store.ts:128-133` 在 `watchSession` 里按 `blob:` 前缀 revoke。这正是我提示的"不要只补依赖"——避免了缓存条目指向死 URL 的二次 bug。

### P3-6 全屏 dock 内缩 20px → ✅ 修复
`ThreeColumnFrame.tsx:220` 改成 `inset: 0`，注释也改对了（绝对定位的包含块是 root 的 padding box）。

### P3-7 `Origin: null` 抛异常 → ✅ 修复
`host.js:811-815` 显式 try/catch 成 `originHost = ''`，不再靠上游 webserver 的 catch 兜。

### P3-9 webview 独立 partition → ✅ 修复
`BrowserView.tsx:257` `partition="persist:dbdy-guest"`，`webview.d.ts:6` 补了类型。partition 是常量、随元素首次挂载写入，不会触发 Electron"attach 后改 partition"的抛错。访客 cookie 与 harness 源彻底分家。

### P3-10 零碎项 → ✅ 三条已修
- ⌘J 修饰键：`layout-store.ts:197` 加 `|| e.shiftKey || e.altKey`，⌥⌘J 放行给 DevTools。
- 顺带修了一个我没报的真 bug：`:205` + `App.tsx:86` 的 `dockFallback`——之前 `onKeyDown` 调 `toggleDock()` 不传 fallback，`pane === null` 时首次按 ⌘J 是死键。
- `onResize` 双 patch：`:192-194` 收敛成一次 `reflow`。
- `IN_ELECTRON` 无用 import：已删。

### 增补项：xterm 主题跟随（原报告没有，本轮自选）
`TerminalView.tsx:76-84` 抽 `readTheme()`，`:100-101` 用 MutationObserver 盯 `data-ds-dark-theme`，`:231` 卸载时 disconnect。逻辑成立：属性变更后微任务里 `getComputedStyle` 会同步重算样式，读到的是新值；xterm 6 对 `options.theme` 赋值会触发 ThemeService 刷新。
一个缺口见 N7。

---

## 二、误修 / 修得不完整

### 1. 【误修·P2】P2-8 窗口边缘缩放：四条边缘条落在了错误的位置，等于没修

`ThreeColumnFrame.tsx:48-55` + `:343`

```jsx
const EDGE_BASE = { position: 'absolute', pointerEvents: 'none', WebkitAppRegion: 'no-drag' }
{ ...EDGE_BASE, top: 0, left: 0, right: 0, height: 6 }   // ← 相对谁的 0？
```

这四条 strip 是 root 的绝对定位子元素，而 root（`:317-341`）有 `position: relative` **和 `padding: var(--db-gap)`**。绝对定位的包含块是祖先的 **padding box**，所以 `top: 0` 落在距窗口边缘 **10px** 处，四条 strip 覆盖的是 **10–16px 这一圈**，而窗口最外面的 0–10px 环——正是 macOS 缩放热区所在——**仍然整片是 `app-region: drag`**。

讽刺的是，同一个提交在 `:220` 把全屏 dock 从 `inset: var(--db-gap)` 改成 `inset: 0` 时用对了这条规则（padding box），转头在边缘条上按"inset:0 = 窗口边缘"用反了。

- 影响：如果 P2-8 原本成立（需真机验证），改完仍然成立。
- 复测：打包版拖窗口四条边；或在 DevTools 里查 strip 的 `getBoundingClientRect()`，`top` 应为 0 才对，现在会是 10。
- 修法：strip 改 `position: fixed`（fixed 的包含块是视口，`inset:0` 即窗口边缘），或把 `app-region: drag` 从 root 挪到一个 `inset: RESIZE_EDGE` 的内层元素上。

### 2. 【误修·P2】P3-10 preset busy 补跑：加在了不可能触发的位置，真正丢弃用户选择的路径没碰

`presets.ts:377-384`

```js
this.setState({ presetBusy: false, stagedPreset: null })   // :377 —— 刚把 staged 清成 null
this.dsh.sessions.noteAgentPreset(summary.id, r.value)
if (this.state.stagedPreset !== null) void this.applyStagedPreset()   // :384
```

`:384` 读的 `stagedPreset` 在 `:377` 已被置 null，只有"await 期间有人重新 stage 过"才非空。而能在 await 期间 stage 的路径只剩 `startCreatorSession`（`:429` 附近，它不看 busy）；用户从模式选择器点的 `selectPreset`（`:349-353`）**第一行就是 `if (this.state.presetBusy) return`——直接原地丢弃，根本没 stage**，`:384` 永远救不到它。

也就是说，原缺陷「busy 期间的选择被静默丢弃」在最常见的路径上原封不动：**上一次 select 还在飞的时候点另一个模式，UI 没有任何反馈，选择消失**。另一条（`makeDefaultPreset`/`removePreset` 置 busy 期间，会话列表变化触发的 `applyStagedPreset` 在 `:366` bail）同样没有补跑钩子。

正确修法是让 `selectPreset` 在 busy 时**照样 stage**（`setState({stagedPreset})` 后由当前飞行结束时的 `:384` 接力），而不是 return。

### 3. 【不完整·P3】P3-2 文件正文缓存：只修了错误重试，成功的正文仍永不失效
`store.ts:197-198` 把"缓存的 error 不算命中"做对了，点第二次会重读。但**成功读过的文件仍然永远不再刷新**——agent 改完文件，用户再点它还是旧内容，UI 上也没有刷新入口。原报告的主场景（P3-2 的失败序列）没有变化。

### 4. 【不完整·P3】媒体读取失败后，"clicking again retries" 在 UI 上不可达
`store.ts:212-219` 的注释承诺"A cached error is not a cache hit — clicking again retries"，但媒体这条路走不到：
- `FilesView.tsx:238` 现在对媒体路径**跳过** `openFile`，点击树行不再触发任何重读；
- 唯一的请求点是 `MediaPreview` 的 `:130-133`，守卫是 `requested = media !== undefined`，错误态也算"已请求"，effect 不会重跑；
- 错误分支（`:143-149`）没有重试按钮。

结果：媒体预览失败后只能靠切会话恢复。文本文件的重试是通的（`onOpen` 每次点击都调 `openFile`）。建议在错误分支加一个重试按钮直接调 `store.openBinaryFile(path)`。

---

## 三、新缺陷

### N1【P1】dock 关着也会自动开终端：会话切换后凭空 spawn 一个看不见的 PTY

`ThreeColumnFrame.tsx:392`（`{sessionStarted && …}` 取代了 `{dock && sessionStarted && …}`）配 `:174`（`display: visible ? 'flex' : 'none'`）配 `:286`（`visible={view.id === active.id}`）

keep-alive 改造把 dock 列从"关闭即卸载"改成"关闭即 `display:none`"，但 `visible` 的定义**没有把 `dock` 算进去**——dock 关着时，当前 pane 的视图仍然认为自己 visible。于是 `TerminalView.tsx:310-313` 的自动开首个终端逻辑在 dock 关闭状态下照常生效：

复现序列：
1. 打开 dock → 切到「终端」面板（此后 `state.pane === 'terminal'` 长期保留）；
2. 关掉 dock（× 或 ⌘J）——列还挂着，只是 `display:none`；
3. 「新建任务」或点另一个会话 → fence 自增 → `InspectorViewMount` 的 key 变化 → `TerminalView` 全新挂载，`initialized = false`、`visible = true`、`tabs.length === 0`；
4. `add()` → `openTab` → `TerminalPane` 挂载 → WebSocket → **host 在新会话的 cwd 里 spawn 了一个 zsh**，屏幕上什么都看不到。

后果：用户完全无感知地起进程（会跑 shell 的 rc 文件、可能触发 nvm/conda 之类的初始化），并占掉 `TERMINAL_MAX_PER_SESSION = 6` 的一个名额。改造前 dock 关着时列是卸载的，这条路不存在。

同一根因的次要表现：`pane === null` 时 `pickEntry` 返回 `explorer`，于是**每个 started 会话都会预加载文件树**（`FilesView.tsx:236-238` → 一次 `listDirectory` RPC），哪怕用户从没开过 dock；`BrowserView.tsx:305-308` 同理会凭空建一个「新标签页」。

修法：`visible` 应为 `dock && view.id === active.id`（保留 mount 与 `display` 的 keep-alive，但让"是否可见"回归事实）；如果希望关闭 dock 时终端仍随窗口 fit，就把 fit 的门与"自动开首个实例"的门拆成两个 prop。

### N2【P1】地址栏输入一个"之前访问过的" URL 回车没反应，且地址栏显示的和页面不一致

`BrowserView.tsx:128`（`src` state）、`:148-158`（`navigate`）

`src` 现在只由 `navigate()` 写，而 `navigate()` 用的是 `setSrc(next)`。当 `next` 与当前 `src` 字符串相同时，React 不会重写 `src` 属性 → Electron 不会 `loadURL` → **什么都不发生**。

复现序列：
1. 地址栏输入 `https://a.com` 回车 → `src = 'https://a.com'`，页面到 a.com；
2. 在页面里点链接进 `https://a.com/sub` → `sync()` 把 `url`/`input` 更新成 `/sub`，**`src` 保持 `https://a.com`**（这正是 P1-1 修复的意图）；
3. 用户在地址栏改回 `https://a.com` 回车 → `setSrc('https://a.com')` 与现值相同 → 无 DOM 写入 → 页面仍停在 `/sub`，但地址栏和 `url` state 都显示 `a.com`。

现在地址栏是"非受控输入 + 受控回显"的组合，第 3 步之后 UI 在撒谎。修法：`navigate()` 里显式 `webview?.loadURL(next)`（Electron 分支）而不是依赖属性 diff；或给 `src` 挂一个自增的导航序号（`key`/额外 state）保证每次回车都是一次真实写入。

### N3【P2】`writeDockWidth` 仍在写一个没有渲染分支认领的 `width` 键

`layout-store.ts:244-250` 写 `flex` + `width` 两个键，而 split 分支（`ThreeColumnFrame.tsx:224`）只渲染 `flex`。松手提交后 React 只会覆盖 `flex`，那个内联 `width` 成了**没有主人的残留**（当前无害：flex-basis 非 auto 时压过 width；且 `dockMax` 分支显式写 `width:'auto'`、退出 max 时被清）。

这与本轮刚确立的"宽度归 state 所有"规则相抵触——哪天有人把 split 分支从 `flex` 改成 `width`，或 dock 不再是 flex item，这个残留就会立刻复活成新的"失钉"。拖动期只写 `flex` 即可。

### N4【P3】关闭一个已断线的终端标签，会先凭空 spawn 一个 PTY 再把它杀掉

`TerminalView.tsx:119-126` 的 killer socket → host `attach()` → `resourceFor()`（`host.js:526-555`）**不存在就先 spawn**，随后才收到 `{type:'kill'}` 把它杀掉。

后果：关闭一个 host 已经不认识的终端（宿主重启过、resource 已被回收）会真的起一个 shell 再立刻杀，期间短暂占用一个并发名额；killer socket 也没有超时，卡在 CONNECTING 就是一条永久挂着的连接。建议 host 侧对 `kill` 意图走一条不 spawn 的路径（`resources.has(key)` 判断），客户端给 killer 加 5s 超时。

### N5【P3】`res.destroy()` 之前设的 500 不会真的发出去

`host.js:255-258`、`:770-773`

```js
if (!res.headersSent) res.statusCode = 500
res.destroy()
```
`destroy()` 不会 flush 状态行，客户端拿到的是连接重置而不是 500。注释写的是"answer 500"，实际是 abort。对 `<img>` 而言可见结果一样（裂图），但日志和排查口径不同。想真的答 500：`res.writeHead(500); res.end()`；已发头则 `res.destroy()`。

### N6【P3】`renderSlot('sidebar', { width: METRICS.sidebar })` 现在是错的

`ThreeColumnFrame.tsx:354` 仍然把常量 268 传给官方 sidebar owner share，而真实宽度已经是 `state.sidePx`。原注释说"没人读它"，但它现在是一条会撒谎的契约值，拖过侧栏后就不再等于实际渲染宽度。传 `sidePx` 是一行的事。

### N7【P3】终端主题只跟 `data-ds-dark-theme`，跟不了 token-only 的主题切换

`TerminalView.tsx:101` 的 `attributeFilter: ['data-ds-dark-theme']`。而 `ThemePresenter.apply`（`theme-presenter.ts:60-65`）除了这个属性，还会用 `body.style.setProperty` 写主题的 alias token 覆盖。深色→另一套深色（colorScheme 不变、只换 token）时属性没动，observer 不触发，终端保持旧配色直到重挂载。把 filter 去掉（或加上 `'style'`）即可，代价是多几次无害的 `readTheme()`。

### N8【P3】`fontFamily` 仍是挂载时快照
`TerminalView.tsx:89` 单独调了一次 `getComputedStyle(mount)` 取 `--db-mono`，没进 `readTheme()`。主题不改字体，所以当前无影响，但两处读法不一致，容易在下次改动时踩空。

---

## 四、专项：`reflow()` 各调用路径的 clamp 一致性

逐路径推演结果（`layout-store.ts:225-241`）：

| 调用点 | 传入 | dock 关闭不变量 | dockPx clamp | 结论 |
|---|---|---|---|---|
| `onResize` `:193` | `{}` 或 `{sidebar:false}` | ✅ | ✅ | 一致 |
| `toggleSidebar` `:308` | `{sidebar:!s}` | ✅ 用的是 patch 后的 side | ✅ | 一致 |
| `startSideDrag` done `:504` | `{sidePx:last}` | ✅ | ✅ | 一致 |
| `resetSideWidth` `:508` | `{sidePx:268}` | ✅ | ✅ | 一致 |
| `startDockDrag` done `:524` | `{dockPx:last}` | ✅（side 未变，恒真） | ✅ 二次 clamp 幂等 | 一致 |
| `resetDockWidth` `:529` | `{dockPx:dockDefault(...)}` | ✅ | ✅ | 一致 |
| **`openDock` `:318-335`（不走 reflow）** | — | 用 `canSplitDock` 决定 overlay，等价 | 内联 `clampDock` | **等价，但是第二份实现** |
| **`toggleDockMax` `:348-356`（不走 reflow）** | — | 退出 max 时查 `canSplitDock` | 不 clamp | **安全**：`reflow` 的 clamp 分支没有 `dockMax` 守卫，overlay 期间的 resize 也会把 `dockPx` 校正好，退出时已经是合法值 |

几点值得记录的细节：

1. **`patch.dock` 用的是 patch 后的值，`dockMax` 用的是旧 state**（`:229`）。目前没有任何调用点通过 reflow 改 `dockMax`，所以正确；但这是个隐式前提，值得在注释里写死，否则将来有人 `reflow({dockMax:false})` 就会读到过期值。
2. **dedupe 循环（`:237-239`）会把等值键删掉，可能让整个 patch 变空**（`:240` 不通知）。因为宽度已经是 state、拖动期的内联值与 state 一致，不会出现"DOM 与 state 分叉却没人通知"的情况——我按每条路径推过（含拖回原位、`setPointerCapture` 抛错走 `finish()` 的路径），都收敛。✅
3. **clamp 用的是 `Math.abs(next - dockPx) > 0.5` 的阈值**，小于 0.5px 的偏差不写回。子像素窗口宽度下 state 与理论值可以差 0.5px，无实际影响。
4. **`clampDock` 的下界仍是 `max(vw*0.30, 416)` 硬地板**，所以 reflow 永远不能靠"变窄"来满足对话列保留宽——只能关 dock。这是设计选择，现在全路径一致了，但意味着侧栏拖宽的临界点上会出现"dock 突然消失"的跳变。建议在那次 patch 里补一条 `dblog('layout', …)`，现场报告才有据可查（`onResize` 关 dock 同理，目前也没日志）。

---

## 五、未处理（原报告里提过，本轮没动，多数可接受）

1. **P2-5 会话切换后 PTY 孤儿**：`TerminalView.tsx:226-239` 的卸载清理仍然只 `socket.close()` 不发 kill，fence 换会话时旧会话的 PTY 照样留在 host 上直到 `session/disposed`。本轮只改善了"显式关闭但 socket 已死"的那一支。考虑到重连能贴回 scrollback，保留是合理的产品选择，但 N1 让它更容易踩到 6 个上限。
2. **P3-5 官方类名哈希耦合**（`tokens.ts:292-322`）：未加任何失效探测。
3. **P3-8 媒体路由无 Origin/CORS 口径**（`host.js:742-757`）：与终端 upgrade 仍不一致（当前不构成泄露）。
4. **`dsh/files.ts:87-97` 的 3 秒不可取消重试**：P1-2 修好之后，过期响应只是被丢弃，但"会话真的不存在时每次展开目录卡满 3 秒"依旧。
5. **`useLayoutSelection` 渲染期写 ref**（`layout-store.ts:542-543`）：并发模式下的撕裂风险仍在。

另外确认：`state.view` / `setView` 保留了（`:300-303`），"新建任务靠它顺手清 `sessionStarted`"的耦合从"隐蔽"变成了"注释里写明"。不算修复，但至少下一个人能看懂。`title`/`setTitle`/`userClosedDock` 已彻底删除，grep 无残留。✅

---

## 总评

这一轮修得**扎实**：P0 那条能杀宿主的路径堵死了，P1-2 的会话代次守卫是全场质量最高的一处（连过期 blob 的 revoke 都想到了），P2-3 的宽度所有权收敛把一类 bug 从"下次还会犯"变成了"结构上不可能"，测试也从字符串匹配挪到了真正的 store 行为断言（`plugin.test.mjs:398-447`）。16/20 条按预期落地，typecheck 干净。

需要下一轮处理的，按优先级：

1. **N1**（dock 关着自动 spawn PTY）——keep-alive 改造的直接副作用，一行 `visible` 定义的事，但后果是用户无感知起进程。
2. **N2**（地址栏回旧 URL 失效）——P1-1 修复的配套没做完，UI 会撒谎。
3. **P2-8 的误修**（边缘条落在 padding box 内）——`position: fixed` 一行改完，同时值得记一条教训：这个仓库里已经因为"绝对定位的包含块是 padding box"这一个知识点，在同一个提交里同时改对了一处、改错了一处。
4. **preset 补跑的误修**——把 `selectPreset` 的 busy 早退改成"照样 stage"才是真修法。

方法论上有一条值得沉淀：本轮四条"误修/不完整"里有三条（P2-8、preset 补跑、媒体重试）的共同特征是——**改动本身写了正确的注释，但代码没有覆盖注释描述的那条路径**。注释是意图，不是验证。这几处如果各配一条最小断言（strip 的 `top` 是否为 0、busy 期间 select 后 `stagedPreset` 是否非空、错误态下再次点击是否发起第二次请求），都会在合并前就红。
