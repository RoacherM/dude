# DeepBuddy 只读深度体检报告

- 日期 / agent：2026-08-27 / claude (opus)
- 范围：`plugins/deepbuddy/src/client/**`、`plugins/deepbuddy/src/host.js`、`apps/desktop/main.js`
- 基线：`git log ea6cd65..HEAD`（视觉 v2 浮岛 → dock 宽度失钉修复）
- 方式：全量通读 5285 行客户端 + 815 行 host + 310 行 Electron 主进程；关键外部行为在 `node_modules/@deepseek-ai/dsh-host-webserver/lib/index.js`、`dsh-client-ui-conversation/lib/client.js` 里核对过（下文凡涉及"已核对"处标注）。**未运行应用**，凡需真机验证的结论都单独标注了复测方法。

---

## P0 — 会崩溃 / 丢数据

### P0-1 媒体流没有 error 监听 → 整个 dsh 宿主进程崩溃，所有会话中断

`plugins/deepbuddy/src/host.js:251`、`:259`、`:273`

```js
res.statusCode = 200
createReadStream(filePath).pipe(res)          // 251 / 259
createReadStream(filePath, { start, end }).pipe(res)  // 273
```

三处 `createReadStream` 都没有 `.on('error', …)`。Node 的 `stream.pipe()` **不转发 error**，ReadStream 上一个没有监听器的 `'error'` 事件会作为 uncaughtException 抛出；这里是 I/O 回调栈，HTTP server 捕获不到，进程直接退出。

失败序列：

1. 工作区里有一个 `stat` 得到但读不了的媒体文件（`chmod 000`、macOS TCC 保护目录、坏软链目标、NFS/外挂盘掉线，或 agent 在 `stat` 与 `open` 之间删掉了它）。
2. 用户在文件树点它 → `MediaPreview` → `readBinary` 返回 `{kind:'url'}`（桌面版一定走这条，`host.js:687`）→ `<img src=…>` 发起 GET。
3. `streamMedia` 里 `resolveWorkspaceFile` 的 stat 通过（`:189`），`createReadStream` 打开时 EACCES/ENOENT → `'error'` 无人接 → **spawn 出来的 dsh 子进程死亡**。
4. 桌面壳表现：窗口白屏 + `main.js:221` 的 `did-fail-load` 每 1.2s 重试一次永远失败；所有正在跑的 agent 会话、终端 PTY 一起没了（未落盘的 turn 丢失）。

同一函数还有第二条未处理路径：`host.js:755` 的 `void streamMedia(ctx, req, res, …)` 没有 `.catch`——`res.setHeader` 在 headers 已发送后抛出等情况会变成 unhandled rejection，Node ≥15 默认同样以进程退出收场。

对照：`dsh-host-webserver` 只对 **同步 handler 抛出**和 **返回的 promise reject** 做了 try/catch（`lib/index.js:231-239`，已核对），对 handler 内部异步 stream 的 error 事件无能为力。

修法方向：`const s = createReadStream(...); s.on('error', e => { if (!res.headersSent) { res.statusCode = 500 } res.destroy(e) }); s.pipe(res)`，并把 `void streamMedia(...)` 改成 `.catch()`。

---

## P1 — 功能错误

### P1-1 `<webview src>` 受控 → 每次页内导航都触发一次整页重载，SPA 状态被打回

`plugins/deepbuddy/src/client/features/browser/BrowserView.tsx:230`（`src={url}`）、`:141-151`（`sync`）、`:167-168`（`did-navigate` / `did-navigate-in-page`）

`url` 是 React state，`sync()` 在导航完成后把 `webview.getURL()` 写回 state，React 随即把变化后的 `src` 属性写到 `<webview>` 上。Electron 的 `SrcAttribute.handleMutation → parse → webContents.loadURL()` 是无条件的（属性值确实变了就重新加载），于是：

- 点一个普通链接 → 页面加载一次（guest 自己导航）→ `did-navigate` → `setUrlState` → `src` 属性变 → **同一个 URL 再加载一次**。表现为闪一下、网络请求翻倍、滚动位置归零。
- 更严重的是 `did-navigate-in-page`（`:168`）：SPA 的 pushState / hash 路由本来是**不重载**的页内跳转，被这条链路变成一次**整页 loadURL**。失败序列：在 dock 浏览器里打开任意 SPA（如某文档站/控制台）→ 点侧边目录 → 页面整体白屏重载，输入框内容、已展开的树、未提交的表单全部丢失。

（React 18 对无连字符标签 `webview` 走普通 host element 的 attribute diff，属性值变化必写；`peerDependencies` 锁 react ^18.2.0，`package.json:37`。）

修法方向：`src` 只做初始值/显式导航用（`ref` + `loadURL`，或给 webview 一个只在"用户主动导航"时才变的 key），`sync()` 只更新地址栏 `input` 与历史按钮状态，不回写驱动 `src` 的那个 state。

### P1-2 文件数据面没有会话代次守卫 → 切会话后旧工作区的目录/文件内容会落到新会话的树上

`plugins/deepbuddy/src/client/features/files/store.ts:139-161`（`loadDir`）、`:170-181`（`openFile`）、`:184-223`（`openBinaryFile`）

三个异步动作都在**入口**读一次 `this.watchedId`，`await` 之后直接 `setState` 写入，**没有再校验 watchedId 是否仍是当初那个**。而 `watchSession`（`:123-127`）在会话切换的同一刻把 `fsChildren/fileBodies/mediaBodies` 清空。

放大这个窗口的是 `dsh/files.ts:87-97`：`session-not-found` 会重试 12 次 × 250ms，**单次调用最长挂 3 秒**，且 `FilesStore.loadDir` 调用时没传 `signal`（`store.ts:147`），无法取消。

失败序列：在会话 A 展开一个大目录（或刚切进来、host 端还在 hydrate，走进 3 秒重试）→ 立刻切到会话 B → B 的树先渲染成空 → 1~3 秒后 A 的响应到达 → `fsChildren['root']` 被写成 **A 工作区的文件列表**，`fsRoot` 也被覆盖成 A 的路径。用户在 B 的会话里看到 A 的工作区，点进去 `openFile` 用的是 B 的 `sessionId` + A 的路径 → `outside-root` 拒绝，报"无法读取"。

这正是 597822a（`会话栅栏统一：修复跨 workspace 浏览器残留`）在浏览器侧修掉的同一类问题，files 侧漏了。修法：给 store 一个 `generation` 计数，`watchSession` 自增，每个 `setState` 前比对；或给每次会话切换建一个 `AbortController` 并把 signal 一路传进 `listDirectory`。

### P1-3 `openBinaryFile` 少一个 `.catch` → 媒体预览永远停在"读取媒体…"

`plugins/deepbuddy/src/client/features/files/store.ts:189-222`

`openFile` 有 `.catch`（`:177`），`openBinaryFile` 的 `.then(...)` 链后面什么都没有。传输层拒绝（host 半边未加载 → `files.ts:92` 抛 `deepbuddyFiles/readBinary: …`）时：`mediaBodies[path]` 停在 `'loading'`，UI 永远显示"读取媒体…"（`FilesView.tsx:140-142`），并且 `openBinaryFile` 的幂等守卫（`:187` `!== undefined`）意味着**再点一次也不会重试**，只能靠切会话重置。同时渲染进程里留下一条 unhandled rejection。

---

## P2 — 边界 / 竞态

### P2-1 侧栏拖宽不重算 dock，会把对话列挤到 460px 保留宽以下

`plugins/deepbuddy/src/client/shell/layout-store.ts:516-525`（`startSideDrag` 的 done 只调 `clampDockWidth`）、`shell/geometry.ts:91-95`（`clampDock` 的 min 是硬地板）

`clampDock` 的下界是 `max(vw*0.30, 416)`，**优先级高于**"对话列还剩不剩 460"的上界（`Math.max(min, …)`）。侧栏拖动只回调 `clampDockWidth`，既不会重新判断 `canSplitDock`，也没有任何东西约束侧栏本身。

算术复现（GAP=10，CHAT_RESERVE=460，DOCK_MIN=416）：

- vw = 1200，侧栏 268（含缝 278）→ `dockFits`：1200-20-278-10-460 = 432 ≥ 416 ✅ → dock 以 416 分栏打开。
- 把侧栏拖到上限 380（含缝 390）→ 预算 1200-20-390-10 = 780；780-460 = 320 < 416 → `clampDock` 返回 **416 不动**。
- 对话列实得 1200-20-390-10-416-10 = **354px**，比保留宽少 106px。窗口 resize 会触发 `onResize` 的收拢逻辑，拖侧栏不会——不变量只在一条路径上被守住。

### P2-2 侧栏拖过的宽度在收起/展开后静默丢失（dock 记得，侧栏不记得）

`shell/layout-store.ts:523`（写内联宽）、`:527-530`（reset）、`ThreeColumnFrame.tsx:56-60`（React 侧 `width: METRICS.sidebar`）、`:323`（`{sidebar && …}` 整列卸载）

这是用户点名的"同类模式"里唯一还活着的一处，但机理和 dock 不同，我把结论写清楚：

- **React style diff 不会清掉它**。`DeepBuddySidebar` 的 style 对象每次渲染键和值都完全一致（`width: 268` 常量），React 18 的 `setValueForStyles` 只在 `prevStyles[k] !== nextStyles[k]` 时写 DOM，所以手写的 380px 在重渲染中是安全的。dock 之所以被清，是因为 `dockMax` 分支**换了 style 的键集合**（`ThreeColumnFrame.tsx:192-199`：`{position,inset,zIndex,width:'auto'}` ↔ `{flex,minWidth}`），React 清理"上一轮有、这一轮没有"的键时把 `width` 一起清了。
- **但收起侧栏是整列卸载**（`:323`），重新展开时 React 按 props 重新写 `width: 268px`，用户拖过的宽度没有任何地方记着（没有 dock 的 `dockPx` 对应物，`layout-store.ts:154`）。

失败序列：把侧栏拖到 340 → ⌘/点按钮收起 → 再展开 → 回到 268。同一 store 里 dock 有 `dockPx` 记忆、侧栏没有，是一种会让人以为"偶发"的不一致。

### P2-3 `repinDock` 是补丁而不是不变量——同类问题只被堵住了当前这一个触发点

`shell/layout-store.ts:257-264`、`ThreeColumnFrame.tsx:187`

`useLayoutEffect(() => { layout.repinDock() }, [layout, dockMax])` 只覆盖 **mount** 和 **dockMax 翻转**两个时刻，而 `repinDock` 的守卫是 `if (el.style.width !== '') return`。这意味着：

- 任何**新增**的、会改变 dock 岛屿 style 键集合的条件分支（比如以后给 dock 加一个 `borderLeft`/`boxShadow` 的临时态，或把 `minWidth` 改成条件的），都会重新触发同一个 bug，而且不会有任何测试挡住它（`tests/plugin.test.mjs:440-448` 只是字符串匹配源码）。
- 守卫用"`style.width` 非空就跳过"，无法区分"我钉的"和"React 写的"，将来若 React 侧真的给出一个 width，重钉会静默失效。

结论式建议：宽度应该是**渲染出来的**（把 `dockPx` 放进 store state，作为 `style.width` 的值渲染，拖动时用 ref 直写 + 拖动结束提交一次 state），或者反过来把整列的 style 变成永不换键的常量对象、把 dockMax 的浮层态放到**外层包裹元素**上。现在这两种模型混着用，是 4117ba3 之后仍然脆的根因。

其余几处"绕过 React 手写 DOM"我逐个核过，结论是**当前安全**，记录判据以免以后被误改：

| 位置 | 结论 | 判据 |
|---|---|---|
| `freezeDockEmbeds` `layout-store.ts:272-307` | 安全 | `<webview>`/`<iframe>` 的 style props 是常量字面量（`BrowserView.tsx:230/238`），diff 不写；隐藏 pane 宽度为 0 被 `measuredWidth > 0` 过滤掉（`:285`），只冻可见的那个；拖动中若 pane 卸载，thaw 写到游离节点，无副作用 |
| 拖动手柄的 `classList` / pointer capture `:453-514` | 安全 | 手柄若在拖动中被卸载（⌘J 关 dock），`lostpointercapture` 会兜住 `finish()`（`:495-497`），thaw 与 body cursor 都能复位 |
| xterm 的 `mountRef` `TerminalView.tsx:223-236` | 安全 | React 只渲染空容器，xterm 自己的 DOM 在它内部，React 永不 diff |
| keep-alive 的 `display` 切换 `ThreeColumnFrame.tsx:155`、`TerminalView.tsx:291`、`BrowserView.tsx:256` | 安全 | 全部是 React 渲染出来的 props，没有手写 |
| `document.body.style.cursor` `:483/498` | 轻微 | 结束时恢复成 `''` 而不是拖动前的值，会吞掉别人设置的全局 cursor |

### P2-4 会话绑定晚于一个 microtask hydrate 时，dock 开关变成死开关

`plugins/deepbuddy/src/client/dsh/adapter.ts:310-338`

`syncSessionStarted` 在 binding 还没 hydrate 时只补一次 `queueMicrotask(syncSessionStarted)`（`:331`），注释也承认"session hydration does not re-notify `list`"。如果 hydrate 比一个 microtask 晚（冷启动恢复上次会话、跨进程 IPC 一个 tick），`sessionStarted` 会一直是 false。

此时的表现：`ThreeColumnFrame.tsx:367` 的 `{dock && sessionStarted && …}` 让 dock 永不渲染，而 `App.tsx:53-67` 的 toggle 因为 `dock && sessionStarted` 为假**照常显示**。用户点它 → `state.dock` 变 true 但屏幕上什么都没有 → 再点一次 → `toggleDock` 走 `closeDock` 分支 → 依然什么都没有。开关看起来彻底坏掉，直到下一次 session list 通知才自愈（`:322` 的第二个条件会补上订阅）。

复测方法：冷启动打开一个已有会话，立刻点 dock 图标；或在 `syncSessionStarted` 的 microtask 分支里打 `dbwarn` 观察是否命中。

### P2-5 切会话/新建任务后，上一会话的 PTY 变成看不见也关不掉的孤儿，并占满 6 个名额

`TerminalView.tsx:185-197`（卸载只 `socket.close()`，不发 `kill`）、`host.js:597-603`（只有 `session/disposed` 才回收）、`App.tsx:108-118`（栅栏只清渲染端账本）

栅栏机制清的是**客户端**的 tab 账本和视图状态；host 端的 `TerminalResource` 按 `sessionId\0termId` 长期持有 PTY，只在 `session/disposed` 或插件卸载时回收。

失败序列：在会话 A 开满 6 个终端（`TERMINAL_MAX_PER_SESSION`，`host.js:63`）→ 点「新建任务」（`Chat.tsx:22` → `setView` 顺带把 `sessionStarted` 置 false，dock 立刻卸载）→ 会话变了，`fenceTerminalSession` 把计数器归 1、账本清空 → 回到会话 A → 终端视图自动开 `term-1`，**重新贴上还在跑的旧 PTY**（scrollback 全在，这部分是好事）→ 但用户想开第 7 个时，`runningCount` 已经是 6 → `resourceFor` 抛 `terminal-limit-reached`（`host.js:539-541`）→ UI 只显示一句"终端连接失败"（`TerminalView.tsx:166-170`），没有任何入口能看到或关掉那 6 个。

同时：dock 关闭期间 PTY 及其子进程（编译、dev server、agent 跑的命令）继续在后台跑，用户无从知晓。

### P2-6 socket 停在 CONNECTING 时关闭标签页无效，且会叠加监听器

`TerminalView.tsx:98-112`

```js
if (socket.readyState === WebSocket.CONNECTING) socket.addEventListener('open', killAndClose, { once: true })
else killAndClose()
```

CONNECTING 分支把"关闭"完全押在 `open` 会到来上。若 host 半边没加载 / 端口卡住，`open` 永不触发 → `onClosed` 永不调用 → 标签页留在账本里关不掉；反复点 × 会不断给同一个 socket 追加 `open` 监听器（每次都会在将来某刻各触发一次 `onClosed`）。缺少一条 `socket.close(); onClosed(termId)` 的兜底。

### P2-7 桌面壳的进程组 kill 是空操作，退出后 PTY 子孙进程可能留守

`apps/desktop/main.js:252-258` 配 `:153`

```js
try { process.kill(-child.pid, 'SIGTERM') } catch { /* no group */ }
```

`spawn` 没有 `detached: true`（`:153-165`），子进程不是进程组组长，`-child.pid` 不是它的 pgid：正常情况直接 ESRCH 被吞掉（注释里"so any dsh-spawned children go with it"实际没有生效）；极端情况下 `child.pid` 恰好等于**另一个**进程组的 pgid，SIGTERM 会打到无关进程组。而 dsh 子进程收到 SIGTERM 后能否走到 `terminals.dispose()`（`host.js:605-608`）取决于它自己的信号处理——走不到，`node-pty` 起的 zsh 及其子孙就成为孤儿。

复测：打包版跑起来，开两个终端并在里面 `sleep 999`，退出 App 后 `ps -ef | grep sleep`。

### P2-8 `-webkit-app-region: drag` 铺满全窗，很可能吃掉窗口边缘的缩放热区

`ThreeColumnFrame.tsx:309`（root `WebkitAppRegion: 'drag'` + `padding: var(--db-gap)` + `height: 100vh`）

28b4b3f 把整个窗口地面变成拖动面，岛屿通过 `PANEL`（`ColumnFrame.tsx:103`）退出、列缝手柄通过 `.dbdy-handle` 退出（`tokens.ts:248`）。**没有退出的是窗口最外圈那 10px 的 frame ring**——而这正好是 macOS 用来做边缘缩放的命中带。Electron 明确记载 draggable region 覆盖处无法缩放窗口。

失败序列（需真机验证）：打包版把鼠标移到窗口右边缘/下边缘 → 光标不变成缩放箭头、拖拽变成**移动窗口**而不是改变大小；四角可能还剩几像素可用。

复测方法：`open apps/desktop/dist/mac-arm64/DeepBuddy.app`，逐一试四条边和四个角；若确认，修法是给 root 再叠一圈 `-webkit-app-region: no-drag` 的 4~5px 内边框元素，或把拖动面从 root 挪到"padding 区减去外 5px"的专用元素上。

### P2-9 品牌槽注册没有挂在 `ctx.effect` 上，插件卸载/HMR 会残留并重复注册

`dsh/adapter.ts:292-295`

```js
slots.inject('conversation.hero.brand.mark', () => slots.register({...}, DeepBuddyBrandMark))
```

同文件其它注册（layout 服务 `:261`、主题 `:265`、样式 `:278`）和 `App.tsx` 里的 dock toggle（`:154-158`）都规规矩矩包在 `ctx.effect` 里拿到 disposer，唯独这一条裸调用，返回的 disposer 被丢弃。开发态 HMR 或 profile 重载会留下一份幽灵注册；单占位 slot 上再来一个 priority -1 的注册者，行为取决于 ui-slots 的去重策略（未验证），最好的情况也是泄漏。

---

## P3 — 可维护性 / 脆弱约定

### P3-1 layout state 里有三份死状态，注释还在描述它们不存在的行为

`shell/layout-store.ts:49-52`（`view`）、`:79`（`title`）、`:141-142`（`userClosedDock`）

- `state.view` 只被 `setView` 自己的 early-return 读过（`:317`），没有任何渲染读它；`WORKBENCH_APPS` 目录在 catalog.ts 里已经不存在，注释 `:49` 还在指向它。
- `setTitle` 全仓库零调用，`state.title` 同样只出现在那条 early-return 里。
- `userClosedDock` 只写不读；`:141` 和 `:191-193` 的注释宣称"手动关掉的 dock 在窗口变宽后不会自动重开"，而代码里**根本没有自动重开**这回事——一条不存在的规则配了一个不存在的守卫。

连带一个真实的耦合：`ChatNav` 调 `layout.setView('chat')`（`Chat.tsx:22`）唯一的实际效果是 `:318` 顺手把 `sessionStarted` 置 false 从而卸载 dock。一个叫"切换工作台应用"的动词，靠一个和它无关的条件（`title === null`）产生副作用，是下一次改动最容易踩空的地方。

### P3-2 文件正文永不失效：agent 改完文件，用户点回来还是旧内容

`features/files/store.ts:173`（`fileBodies[path] !== undefined` 直接 return）

缓存没有失效入口，UI 上也没有刷新按钮（`FilesView.tsx:174-219`）。失败序列：打开 `src/foo.ts` → 让 agent 改它 → 再点这个文件（或它已经在标签页里）→ 仍是修改前的内容，且**没有任何提示**。同一守卫也让读取失败的文件无法重试（`fileBodies[path]` 已是 `{error}`）。

### P3-3 媒体预览的 revoke effect 捕获的永远是 `null`

`features/files/FilesView.tsx:132-139`

```js
useEffect(() => {
  const current = store.state.mediaBodies[path]   // 挂载时还是 undefined/'loading'
  const url = … ? current.url : null              // → null
  return () => { if (url !== null) URL.revokeObjectURL(url) }
}, [store, path])                                 // 依赖里没有 media，拿到 URL 后不会重跑
```

字节是挂载后异步到的，effect 依赖里又没有 `media`，所以 cleanup 里的 `url` 恒为 `null`——注释说的"a preview never leaks"没有兑现。桌面版因为走 HTTP `kind:'url'`（`host.js:687`）本来就没有 blob，影响仅限没有 webServer 的部署（base64 兜底路径，`store.ts:216-221`）。

注意**不要**只补依赖了事：blob URL 存在 store 的 `mediaBodies` 里跨卸载存活，卸载时 revoke 会让下次打开同一文件拿到已失效的 URL（图片裂开）。要么 revoke 的同时把 store 里的条目一并删掉，要么把 blob 的所有权整体收进 store 并在 `watchSession` 里统一回收。

### P3-4 测试是对源码/产物做字符串匹配，挡不住真正的回归

`plugins/deepbuddy/tests/plugin.test.mjs:194-212`、`:440-448`

例如 `assert.match(terminal, /\}, 80\)/)`（防抖 80ms）、`assert.match(bundle, /INSPECTOR_VIEW_TYPES = \[\s*\n\s*FilesViewDefinition,…/)`、`assert.match(layout, /handle\.classList\.add\('dragging'\)/)`。这些断言：

- 改个格式（prettier 换行、把 80 提成常量 `RESIZE_SETTLE_MS`）就红，**噪声高**；
- 而本报告里 P0/P1 那些真正的行为缺陷，一条都不会被它们发现，**信噪比低**。

`shell/geometry.ts` 是纯函数、已经刻意抽出来"testable without a DOM"，`clampDock` / `canSplitDock` 的边界（P2-1 那组数字）本该在这里有真值断言，现在没有。

### P3-5 对官方产物的类名哈希耦合

`ui/tokens.ts:292-322`：`.dbdy div[class*="_headline"]`、`button[class*="_sessionLogButton"]`、`header[class*="_header"] > div[class*="_titleRow"]`。

我在 `dsh-client-ui-conversation@0.1.1-rc.2` 的产物里核对过，当前哈希前缀是 `wSkVaW_`，语义后缀确实稳定，选择器现在是有效的。但这是"官方一改 CSS Module 命名，DeepBuddy 的头部对齐和隐藏规则同时静默失效"的单点，注释里已经写了 `revisit on upgrade`——建议至少加一条能在启动时检测选择器是否命中的诊断（`dblog('layout', …)`），否则失效时表现为"标题莫名其妙低 2px、导出按钮突然冒出来"，没人会联想到版本升级。

### P3-6 全屏 dock 的内缩是 20px 而不是注释宣称的"落在岛屿网格上"

`ThreeColumnFrame.tsx:198`（`{ position:'absolute', inset:'var(--db-gap)' }`）配 `:318-321` 的注释

绝对定位的包含块是最近定位祖先（root，`:293` 有 `position: relative`）的 **padding box**，root 本身已经有 `padding: var(--db-gap)`。所以 `inset: 10px` = 距窗口边缘 20px，而其它两个岛屿在 10px 处。注释说"insets itself by the gap against the root's padding box, which is what lands it exactly on the island grid instead of a second gap in from it"——恰好说反了，代码给出的正是它想避免的 "a second gap in"。要落在网格上应为 `inset: 0`。（若 20px 是有意的视觉选择，那就是注释错了，需要改注释。）

### P3-7 终端 upgrade 的 Origin 校验对 `Origin: null` 走的是抛异常而非判断

`host.js:790`：`new URL(origin).host !== host`

`Origin: null`（沙箱 iframe、`data:`/`file:` 页面，都可能出现在 dock 浏览器里）会让 `new URL('null')` 抛 TypeError。我核对了 `dsh-host-webserver/lib/index.js:231-239`——handler 的同步抛出被 try/catch 接住，记一条 warn 后 `socket.destroy()`，**方向是 fail-closed，不会崩进程**。所以这只是"用异常代替判断"的整洁性问题，但它靠的是上游的 catch，属于隐式约定。建议显式写成 `let originHost; try { originHost = new URL(origin).host } catch { /* 拒绝 */ }`。

### P3-8 媒体路由没有 Origin/CORS 约束（与终端路由的口径不一致）

`host.js:742-757` 的 `MEDIA_ROUTE` handler 不做任何来源检查，而同文件的终端 upgrade 做了（`:788-794`）。跨源页面因为没有 `Access-Control-Allow-Origin` 读不到响应体，`<img>/<video>` 也只能加载不能读像素（会被 taint），所以**当前不构成信息泄露**；但两条路由口径不同，且未来任何一次"给媒体路由加个 JSON 探测接口"的改动都会立刻把它变成漏洞。

### P3-9 `<webview>` 没有独立 partition，访客页面与应用共用默认 session

`BrowserView.tsx:230`、`apps/desktop/main.js:215-217`（`webviewTag: true`，无 `partition`）

dock 浏览器可以打开任意站点，这些访客页面与 DeepBuddy 自身（`http://127.0.0.1:<port>`）共用默认 session 的 cookie/存储分区。同源策略仍然生效，我没有找到可直接利用的提权链（导航到应用源会让攻击页失去脚本上下文，跨源 iframe 又无法被脚本化），所以这是加固项而非漏洞：建议 `<webview partition="persist:dbdy-guest">`，把访客流量与 harness 源彻底隔离。

### P3-10 若干小口径问题

- `shell/layout-store.ts:205-216`：⌘J 不检查 `shiftKey/altKey`，`⌥⌘J`（DevTools）、`⇧⌘J` 一并触发；也不检查焦点是否在 xterm/输入框内。
- `shell/layout-store.ts:196-203`：`onResize` 里可能连发两次 `patch`，一次窗口缩放触发两轮渲染。
- `shell/ThreeColumnFrame.tsx:32`：`IN_ELECTRON` 导入后未使用（tsconfig 没开 `noUnusedLocals`，所以类型检查不会报）。
- `shell/layout-store.ts:558-562`：`useLayoutSelection` 在渲染期写 `selectRef.current`（渲染副作用），并发/StrictMode 下有撕裂风险。
- `dsh/presets.ts:363-381`：`applyStagedPreset` 在 `presetBusy` 时直接返回，busy 结束后没有补跑，暂存的 preset 可能被静默丢弃。
- `dsh/files.ts:87-97`：`session-not-found` 重试上限 3 秒且不可取消（见 P1-2），真的找不到会话时每次目录展开都要卡满 3 秒才显示错误。

---

## 关于 `-webkit-app-region` 覆盖面的专项结论

用户点名要排查"交互元素被 drag 区吞掉"的死角，逐面核对结果：

- **全局 no-drag 规则**（`tokens.ts:282-286`）覆盖 `button, a, input, textarea, select, [role=tab|button|menuitem], [contenteditable], [role=dialog]`，且**故意不加 `.dbdy` 前缀**以覆盖 portal 出去的官方设置弹窗——这个判断是对的。
- **官方会话头**在主列 52px 拖动条（`ThreeColumnFrame.tsx:349`）之下：我核对了官方产物，`titleRow` 里的面包屑是 `<button class="…_crumb">`（`dsh-client-ui-conversation/lib/client.js` 的 CSS 里有 `.wSkVaW_crumb:hover:not(:disabled)`），会被全局规则覆盖；`_tabs` 行被 tokens.ts 推到 52+10px 以下，不在拖动条内。**当前没有死角**。
- **风险面**是 `KIT.Select` 的选项行是裸 `<div onClick>`（`kit.tsx:520-538`）、`InspectorTabs` 的标签页也是裸 `<div onClick>`（`InspectorTabs.tsx:30-33`）。它们目前都落在岛屿 body（`PANEL` 已 no-drag）里所以没事，但只要有一个 Popover 展开后覆盖到主列顶部那条**不可见的** 52px 拖动条（`zIndex:-1` + `pointerEvents:none` 对 Electron 的区域收集完全无效，区域收集不看 z-order 和 pointer-events），点选项就会变成拖窗口。建议给 `kit.tsx` 的选项行和 `InspectorTabs` 的标签页各补一个 `role="button"`（顺带补齐键盘可达性，`RowImpl:625-633` 已经是这么做的），成本极低。
- 真正的问题是 P2-8 的窗口边缘缩放。

---

## 总体架构健康度

**结论：结构分层是这个仓库最强的部分，缺陷集中在"异步生命周期"和"绕过框架的命令式 DOM"两条线上，而这两条线目前都靠注释而不是类型/测试在维持。**

好的方面，值得明确保留：

- **分层是真的**，不是文档里的说法。shell 层零 `if (app.id === …)`，catalog 是两个扁平数组，features 只通过 `InspectorViewProps` 与 shell 通信，dsh 层是唯一懂 ABI 的地方——我通读下来没找到一处越界耦合。加一个 dock 面板确实只需要动 `catalog.ts` 一行。
- **注释密度和质量非常高**，几乎每个反直觉的决定都写了"为什么不是另一种做法"。这在 review 时的价值是巨大的（我能直接核对意图 vs 实现）。代价是：**注释会先于代码腐烂**——P3-1（三份死状态的注释还在描述不存在的行为）、P3-6（注释和盒模型说反了）都是这个模式的账单。
- **host 侧的会话围栏设计是扎实的**：`fs.resolve` + `fs.contains` 交给 seam 判断而不是字符串前缀比较、媒体走 HTTP Range 而不是 base64 灌进 RPC、终端 upgrade 查 Origin——安全模型想清楚了。

需要正视的系统性问题：

1. **异步没有代次守卫，是当前 bug 密度最高的一类。** P1-2（files）、P2-4（sessionStarted hydrate）、P1-3（缺 catch）本质是同一件事：每个 store 都自己手写"订阅 → 异步 → 写状态"，没有一个统一的"这个响应还属于当前会话吗"的闸门。597822a 已经在浏览器侧修过一次同类问题，files 侧又漏一次——说明这不该靠逐个 review 兜。建议给 `FilesStore`/`PresetPlane` 引入一个共享的 `generation`/`AbortController` 约定，让"过期响应"在类型层面就必须被处理。
2. **手写 DOM 与 React 渲染两种模型混用，边界没有守卫。** dock 宽度失钉的根因不是"忘了重钉"，而是"宽度到底归谁管"没有答案。`repinDock` 把当前这一个触发点堵上了，但没有把不变量建立起来（P2-3）。这是我认为**最值得下一轮动手**的架构债：把 dock/侧栏宽度收成 store state + 拖动期 ref 直写、结束时提交一次，能一次性消掉 P2-1/P2-2/P2-3 三条。
3. **测试在错误的抽象层。** 5000 行客户端 + 815 行 host，测试却主要在对源码文本做正则（P3-4）。`geometry.ts` 是全仓库最容易测、边界也最容易错的模块（P2-1 的数字），却几乎没有真值断言；host 侧的 `appendScrollback`、`mediaMime`、Range 解析、`resolveWorkspaceFile` 的围栏拒绝同样都是纯逻辑。把测试预算从"字符串匹配产物"挪到这些函数上，投入产出比会高一个数量级。
4. **进程边界上的错误处理是最薄的一环。** P0-1 是唯一一个能让整个 host 死掉的缺陷，而它就藏在三行没有 error 监听的 `pipe()` 里。渲染层的失败都被认真折叠成了 UI 状态（`{error}` 是值不是异常，这个纪律执行得很好），但一跨到 Node 的 stream/promise 边界，同样的纪律就断了。

优先级建议：**先修 P0-1（一行 error 监听，风险极低）→ P1-2 加代次守卫 → P1-1 让 webview 的 src 非受控 → 再做 P2-3 的宽度模型收敛**。P2-8（窗口缩放）请先真机验证再决定是否插队——如果属实，它是用户每天都会撞到的体验缺陷。
