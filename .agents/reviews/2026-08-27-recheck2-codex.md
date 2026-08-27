# DeepBuddy 修复复审报告

复审范围：`git diff 4117ba3..f76c741`，覆盖 `51226de`、`950fac2`、`381fdb6`、`9838392`、`f76c741`。本次只读审查，没有修改仓库文件。

## 结论先行

- 原报告 16 条 finding：**完整修复 8 条，部分/误修 4 条，未修 4 条**。
- 本批改动另引入 **2 条 P1、5 条 P2**。当前不能判定修复集已收敛，首要阻断项是 Terminal 关闭协议。
- 未发现新的 P0。`51226de` 所处理的媒体流未捕获错误与桌面进程组回收不在原报告 16 条内；本次静态复核认为修法正确，详见文末附加核对。

## 已修

### 1. P1-3：关闭 dock 不再卸载 Inspector

文件：`plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx:194-224,392-401`

当前 `InspectorColumn` 在整个 started session 内持续挂载；`dock=false` 只把列切为 `display:none`，各 View 和 Browser/Terminal Tab 内部也继续以 `display` 保活。

原失败场景已收敛：Browser 浏览多页、填写表单或滚动后关闭 dock 再重开，不会再因外层条件挂载销毁 webview；xterm attachment 也不会仅因收列而重建。

注意：这项修复同时引入了“隐藏 dock 仍向 View 传 `visible=true`”的新问题，见“新缺陷 3”。

### 2. P1-4：Electron Browser 加载失败不再销毁 guest/history

文件：`plugins/deepbuddy/src/client/features/browser/BrowserView.tsx:178-206,249-261`

`did-fail-load` 现在只设置失败状态，失败卡覆盖在仍然挂载的 `<webview>` 上；重试调用现有 guest 的 `reload()`。

原失败场景已收敛：形成浏览历史后访问 DNS 不存在、证书错误或离线地址，失败页不再替换 webview，后退历史和 guest 内页面状态仍在。

### 3. P1-5：sidebar 宽度提交后会重新检查主列预算

文件：`plugins/deepbuddy/src/client/shell/layout-store.ts:211-240,494-505`

sidebar 拖拽松手通过 `reflow({ sidePx })` 一次提交；`reflow()` 使用新 `sidePx` 重新计算 `canSplitDock()`。

原失败场景已收敛：1200px 窗口中把 sidebar 从 268px 拖到 380px，若右列最低 416px 已无法给主列保留 460px，split dock 会关闭，不再把主列压到约 364px。

### 4. P1-7：首次 `Cmd/Ctrl+J` 已有默认 Inspector 目标

文件：`plugins/deepbuddy/src/client/app/App.tsx:82-86`、`plugins/deepbuddy/src/client/shell/layout-store.ts:196-206,359-366`

装配层把第一个 Inspector View 写入 `dockFallback`，快捷键路径调用 `toggleDock(this.dockFallback)`。

原失败场景已收敛：全新 store 尚未打开过任何 pane 时首次按 `Cmd/Ctrl+J`，会打开默认 explorer，不再是无状态变化的死键。

### 5. P2-1：sidebar 拖拽宽度已收归 React state

文件：`plugins/deepbuddy/src/client/shell/layout-store.ts:72-83,494-509`、`plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx:66-79`

提交宽度由 `LayoutState.sidePx` 持有，React 用该值渲染新节点。

原失败场景已收敛：拖到 350px，收起 sidebar 使节点卸载，再展开时仍为 350px，不再回到 `METRICS.sidebar` 的 268px。

### 6. P2-5：`readBinary()` rejection 不再永久停在 loading

文件：`plugins/deepbuddy/src/client/features/files/store.ts:214-272`

Promise rejection 现在进入 `.catch()`，将对应 `mediaBodies[path]` 写为可渲染 error。

原失败表现“未处理 rejection + 永久显示读取媒体”已消失；但新增的 UI 路径实际上不能再次触发重试，见“新缺陷 7”。

### 7. P2-6：Brand slot disposer 已进入插件 effect

文件：`plugins/deepbuddy/src/client/dsh/adapter.ts:288-297`

`slots.inject()` 的返回 disposer 现在由 `ctx.effect()` 接管。插件卸载或热重载时能撤销旧注入，不再累积 ghost brand 注册。

### 8. P2-7：Browser 失败日志不再记录 HTTP(S) 查询凭证

文件：`plugins/deepbuddy/src/client/features/browser/BrowserView.tsx:178-186`

`dbwarn` 的字段已从完整 URL 改为 `host: hostnameOf(...)`。

原失败场景已收敛：带 OAuth code、签名 query 或临时 token 的正常 HTTP(S) URL 加载失败时，现场日志只留下 hostname，不再落完整查询串。

## 误修 / 部分修复 / 未修

### 1. P1-1 部分修复：`fresh()` 挡住 A→B，却挡不住 A→B→A

文件：`plugins/deepbuddy/src/client/features/files/store.ts:126-147,159-183,193-209,214-272`

已修部分：`loadDir`、`openFile`、`openBinaryFile` 的 success/catch 路径都检查 `fresh(id)`，因此 A 请求未完成就切到 B 后，A 的响应不会直接写入 B。

未修部分：`fresh()` 只比较 `watchedId === id`，没有请求 generation/epoch。触发序列：

1. 会话 A 发出旧 `listDirectory` 请求；
2. 切到 B，再切回 A；
3. 新 A 请求先返回并显示新目录；
4. 旧 A 请求最后返回。

第 4 步再次满足 `fresh('A')`，旧响应覆盖新响应。只读 fake 复现最终 `sessionId='A'`、`fsRoot='/A-old'`；`readFile` 与 `readBinary` 具有同样 ABA 竞态。因此原“跨会话异步响应必须被 session fence 丢弃”的目标没有完整实现。

### 2. P1-2 误修：Terminal 关闭协议仍不原子

文件：`plugins/deepbuddy/src/client/features/terminal/TerminalView.tsx:108-145,196-220`、`plugins/deepbuddy/src/host.js:539-595`

已修窄路径：CONNECTING socket 现在同时监听 `open` 和 `close`，连接失败时会调用 `onClosed()`，原来的“永远留在正在连接”不再由这一条路径直接造成。

但 UI 与宿主资源仍不能保证一次收敛：

- `TerminalView.tsx:138-143`：CONNECTING 的 `close` 回调进入 `killAndClose()` 时 socket 已 CLOSED，`send()` 不会发送 `kill`，Tab 却照常移除。若宿主已创建 PTY，资源继续留在 host。
- `TerminalView.tsx:130-145`：readyState 为 CLOSING 时走立即分支；`send()` 同样因非 OPEN 而不发送 kill，UI 仍先消失。
- `TerminalView.tsx:113-128`：无 live socket 时新建 killer WebSocket，但不等待 kill 被宿主处理或任何 ack，就立即 `onClosed()`。完全离线或连接失败时，宿主 PTY 留到 session dispose，界面已无入口。
- `host.js:570-595`：`attach()` 先等待 `resourceFor()`，之后才注册 socket 的 `message`/`close` listener。客户端 WebSocket 刚 open 就发送 kill 时，消息可能在 listener 安装前到达并丢失；随后 host 仍创建并登记 PTY。

因此原报告中的“重连空窗关闭泄漏 PTY”只是增加了 best-effort killer，并没有变成有确认结果的资源关闭协议。此次改动还新增“错误态 Tab 无法关闭”和 killer socket 自身泄漏，分别见“新缺陷 1、4”。

### 3. P1-6 未修：关闭最后一个资源 Tab 仍不会收起 dock

文件：`plugins/deepbuddy/src/client/shell/layout-store.ts:400-410`

`closeTab()` 仍只更新 pane ledger，没有在 `items.length === 0` 时调用 `closeDock()` 或在同一次 patch 中令 `dock=false`。

触发：Terminal 或 Browser 只剩一个 Tab，点击关闭。表现：ledger 变成空，但 `dock` 仍为 true，留下空右列，违反 `design/DESIGN_INTENT.md:218-225` 的“最后一个 Tab 关闭后右列自动收起”。只读 store 复现关闭后状态为 `dock:true, items:[]`。

### 4. P2-2 未修：响应式自动收列仍不可逆

文件：`plugins/deepbuddy/src/client/shell/layout-store.ts:192-194,225-240`

`reflow()` 在分栏放不下时只写 `dock=false`；没有记录这是响应式临时收起，也没有窗口重新变宽后的恢复分支。旧的 `userClosedDock` 被删除，但没有替代性的手动/自动 owner。

触发：1440px 打开 dock → 缩到 1000px 自动收右列 → 拉回 1440px。表现：dock 保持关闭；sidebar 低于 860px 后的自动关闭也同样不恢复。用户手动关闭与系统临时关闭仍无法区分。

### 5. P2-3 部分修复：一个 microtask 改成固定 5 秒轮询，仍可能永久漏订阅

文件：`plugins/deepbuddy/src/client/dsh/adapter.ts:312-360`

已修部分：binding 在普通异步 hydration 中于 5 秒内出现时，100ms interval 能发现它、订阅 session，并同步 `sessionStarted`；current 变化和插件卸载也会清 timer。

未修部分：`tries >= 50` 后轮询永久停止，而 binding hydration 本身不会重发 list 事件。

触发：冷启动/慢盘/远端恢复使 `binding(current)` 在 5 秒后才出现，期间 current 没有变化。表现：没有后续触发源，`sessionStarted` 长期保持 false，dock gate 消失，直到一次无关 list 事件碰巧发生。修复只是扩大等待窗口，没有建立可靠的 binding-ready 订阅。

### 6. P2-4 部分修复：session fence 会 revoke，Store dispose 与同 session 缓存仍漏

文件：`plugins/deepbuddy/src/client/features/files/store.ts:115-117,126-136,214-272`、`plugins/deepbuddy/src/client/features/files/FilesView.tsx:121-133`

已修部分：Blob URL 所有权移到 FilesStore；session 切换时会遍历 `mediaBodies` 并 revoke，stale decode 创建的 URL 也会立即 revoke。原 effect 捕获异步前空值的问题消失。

未修部分：关闭预览 Tab 不做 cache eviction；同一个 session 依次预览许多不同媒体时，每个 blob 保留到 session fence。更确定的生命周期缺口是 `dispose()` 只退订，既不 revoke 已有 blob，也不使未决异步失效；详见“新缺陷 5”。因此原报告涵盖的“关闭 Tab 或切 Session 后 Blob 内存持续累积”只修复了切 Session 一半。

### 7. P3-1 未修：keep-alive 测试仍是源码字符串契约

文件：`plugins/deepbuddy/tests/plugin.test.mjs:187-213`

测试只断言源码存在 `views.map`、`data-inspector-view` 和 `display` 字样，没有挂载组件并验证外层生命周期。

失败场景：今后重新出现 `{dock && <InspectorColumn />}`，内部仍保留现有 `display` 字符串。表现：测试继续通过，webview/xterm 实际仍会被卸载；本轮实现虽已正确修复外层挂载，但测试的已证实假阴性仍在。

### 8. P3-2 未修：app-region 仍无真实 Electron hit-test 覆盖

文件：`plugins/deepbuddy/tests/plugin.test.mjs:628-648`、`plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx:41-55,364-375`

测试只统计 bundle 内 3 个 `WebkitAppRegion:'drag'` 和若干 `NO_DRAG` 字样，没有验证 Electron 对 portal、叠放顺序和非原生交互 `div` 的命中。

失败场景：官方顶栏加入未命中全局选择器的 `div onClick`，或叠放结构变化。表现：点击变成拖窗，但测试仍绿。当前已装配按钮、输入框、handle 的静态覆盖面未发现新的确定死角；问题是测试无法阻止此类回归。

## 新缺陷

### 1. P1：host `error/closed` 后 Terminal Tab 永远无法关闭

文件：`plugins/deepbuddy/src/client/features/terminal/TerminalView.tsx:108-110,196-205,315-319`

`message.type === 'error'` 或 `'closed'` 会先把 `manuallyClosed=true`；之后用户点击 Tab 的关闭按钮，注册的 `closeResource()` 在第 109 行立即 return，既不调用 `onClosed(termId)`，也不移除 ledger。

具体触发：连续打开第 7 个终端触发 host 的 `terminal-limit-reached` error → 点击该 Tab 的 X。表现：错误 Tab 永久留在右列，只能反复点“重新启动”，无法关闭。同样，收到 host `closed` 的 Tab 也会卡住。这是 `f76c741` 引入的确定性 UI 僵尸。

### 2. P1：`reflow()` 在 dock 隐藏或最大化期间破坏已记住宽度

文件：`plugins/deepbuddy/src/client/shell/layout-store.ts:192-194,225-235`

`reflow()` 不论 `dock`/`dockMax` 状态都对 `state.dockPx` 执行当前窗口的 `clampDock()`，把“暂时不可用的渲染宽度”和“用户偏好宽度”写成同一份状态。

具体触发 A：1980px 把 dock 拖到 650px → 最大化 dock → 窗口缩到 1200px → 再放回 1980px → 退出最大化。只读 store 复现 `dockPx: 650 → 416 → 594`，650px 偏好永久丢失。

具体触发 B：1440px 记住 480px → 关闭 dock → 缩窗到 800px → 拉回 1440px → 重开。只读 store 复现宽度 `480 → 416 → 432`。

表现：用户只是临时缩窗、收列或进入浮层，恢复后 dock 宽度却改变，违反 `design/DESIGN_INTENT.md:57-65` 的“临时响应式收列不覆盖用户保存宽度偏好”。现有测试 `plugin.test.mjs:409-416` 只测不发生 resize 的 dockMax round-trip，无法发现该问题。

### 3. P2：dock 隐藏时活动 View 仍收到 `visible=true`

文件：`plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx:194-213,281-288`、`plugins/deepbuddy/src/client/app/catalog.ts:76-82`、`plugins/deepbuddy/src/client/features/files/FilesView.tsx:229-232`

持久挂载修复后，`InspectorColumn` 在 `dock=false` 时仍执行；`pickEntry()` 在 `pane=null` 时选择第一个 explorer，而传给 `InspectorViewMount` 的 `visible` 只比较 `view.id === active.id`，没有与 `dock` 合取。

具体触发：进入已启动会话但从未打开 dock。表现：整列虽然 `display:none`，explorer 仍收到 `visible=true`，`FilesView` 在后台调用 `ensureRootLoaded()` 读取 workspace；Terminal 的可见性/fit 语义也与真实 UI 不一致。应当保活 mount，但不能把隐藏列报告为可见。

### 4. P2：best-effort killer WebSocket 不受 cleanup 管理

文件：`plugins/deepbuddy/src/client/features/terminal/TerminalView.tsx:113-127,226-239`

断线窗口关闭 Tab 时创建的 `killer` 是局部变量，不进入 ref，不被 effect cleanup 关闭；其 `open/error` listener 也没有独立 disposer 或超时。

具体触发：host 端口为黑洞或 TCP 握手长时间悬挂 → 主 socket 已断 → 关闭多个 Terminal Tab。表现：Tab 立即卸载，但多个 CONNECTING killer socket 和 listener 留到系统网络超时；即使组件已 dispose，它们以后仍可能触发。该路径违反 listener/resource 必须成对释放的项目约束。

### 5. P2：FilesStore dispose 后仍可创建 Blob 并写废弃 store

文件：`plugins/deepbuddy/src/client/features/files/store.ts:115-117,126-147,221-272`

`dispose()` 不递增 generation、不清 `watchedId`、不 revoke `mediaBodies`。因此 `fresh(id)` 在插件卸载后仍返回 true。

具体触发：会话 A 发起 base64 `readBinary()` → 在 Promise 完成前卸载/热重载插件 → 旧请求返回。表现：旧 Store 在卸载后执行 `URL.createObjectURL()` 并写 state，且以后没有 session fence 能回收这个 URL。若先完成预览再卸载，已有 blob 同样不会 revoke。

### 6. P2：dock-max 从浮岛网格扩张到覆盖窗口 gap

文件：`plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx:208-224,317-347`

本批把最大化 dock 的 `inset:'var(--db-gap)'` 改成 `inset:0`。绝对定位 containing block 是根节点 padding box；`inset:0` 的边落在 padding 外缘，会覆盖 10px window ground，而不是保留外圈浮岛间隙。

具体触发：打开 dock 后点击“全屏显示”。表现：右列面板贴到窗口四边并盖住 window ground，与 `design/DESIGN_INTENT.md:53-55,295` 的全窗浮岛间隙不一致；普通三列状态有 gap，最大化状态突然无 gap。

### 7. P2：媒体 error 被标成“可重试”，但 UI 没有任何重试入口

文件：`plugins/deepbuddy/src/client/features/files/store.ts:212-220,261-272`、`plugins/deepbuddy/src/client/features/files/FilesView.tsx:128-142,234-240`

Store 允许 `kind:'error'` 再次调用 `openBinaryFile()`，但 `MediaPreview` 的 effect 只在 `media === undefined` 时调用；媒体行的 `onOpen` 又刻意跳过所有媒体读取。

具体触发：第一次 `readBinary()` reject → 页面显示“无法预览” → 再点同一文件，或关闭预览 Tab 后重开。表现：cache 中仍是 error，`requested=true`，effect 不再调用 Store；用户无法触发代码注释声称的 retry，只能等 session fence 清空缓存。

## 五个修复提交的附加核对

- `51226de` host P0：`plugins/deepbuddy/src/host.js:253-286,768-773` 给每个 `createReadStream` 增加 error listener，并兜住 `streamMedia()` rejection；文件在 stat 后被删除/变为不可读时会终止单个 response，不再以未处理 `error`/rejection 杀死 host。`apps/desktop/main.js:153-169,256-261` 以 `detached:true` 建立独立进程组，退出时负 PID SIGTERM 能命中 DSH 及其 PTY 子孙。未发现该修复引入的新缺陷。
- `950fac2` files：基础 A→B 栅栏和 session revoke 有效，但 ABA、dispose、媒体 retry 没有收敛。
- `381fdb6` browser：保活 guest/history 与日志脱敏有效；本轮未发现这两项修复引入新的资源泄漏。
- `9838392` shell 宽度：React state ownership 方向正确，但 `reflow()` 破坏隐藏/overlay 状态下的宽度偏好，并引入 dock-max gap 回归。
- `f76c741` 终端与胶水层：brand disposer、快捷键和普通 binding hydration 有效；Terminal closeResource 仍不满足资源协议，并新增错误态僵尸 Tab与未托管 killer。

## 验证证据与边界

- `node --test plugins/deepbuddy/tests/plugin.test.mjs plugins/deepbuddy/tests/host.test.mjs`：**65 tests，65 pass，0 fail，0 skipped**。
- `pnpm typecheck`（`plugins/deepbuddy`）：通过，`tsc --noEmit` 无报错。
- `git diff --check 4117ba3..f76c741`：通过。
- 只读 fake：复现 Files A→B→A 最终被旧 `/A-old` 覆盖；复现 dispose 后未决 binary 响应创建 blob；复现 dock 650→416→594 与 480→416→432 的宽度偏好丢失；复现最后一个 Tab 关闭后 `dock:true, items:[]`。
- 没有运行 `pnpm test`，因为该脚本先执行 build 并会写 `lib/`，与本轮 review-only 约束冲突；上述 Node tests 直接运行现有产物与源码测试。没有进行真实 Electron app-region、webview、PTY 端到端操作，因此相关结论均限定为源码协议和可执行 store/fake 证据。
- Nowledge 定向检索与状态检查均返回 503；本报告仅依据当前 checkout、设计文档、原报告和只读复现。

## 总体判断

这批修复的主方向是对的：Inspector 保活、宽度进入单一 state owner、Files 异步出口加 fence、Browser 保留 live guest、disposer 进入 effect，都修到了原根因的一部分。但三个核心生命周期仍未闭环：Files 用 session ID 代替 generation，Shell 把即时 clamp 值当作持久宽度偏好，Terminal 用“先移除 UI、再 best-effort kill”代替可确认的资源关闭协议。尤其 Terminal 在 host error 后连 Tab 都无法移除，且 host 仍存在 kill listener 安装竞态；在这些 P1 清零前，不建议把五个提交判定为复审通过。
