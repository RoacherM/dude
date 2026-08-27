# DeepBuddy 第三轮终审报告

审查范围：`git diff f76c741..b12be43`，覆盖 `35155c3`、`8000053`、`4c4a3ad`、`73b5584`、`b12be43`。本轮只读，没有修改仓库文件。

## 最终判定

**未收敛，当前不建议合入。**

- 上轮点名的 2 条 P1、5 条 P2：**7/7 已针对性修复**。
- 本批 5 个提交新增：**1 条 P1、5 条 P2**；最高风险是 Terminal 首连 pending 期间的 kill-intent 会被静默丢弃，Tab 已消失但宿主仍创建不可见 PTY。
- 此外仍有上一轮之前已经确认、但当前 HEAD 尚未处理的 **1 条 P1、2 条 P2**：最后一个 Tab 不收 dock、sidebar 响应式收起不自动恢复、binding 超过 5 秒仍永久漏订阅。
- 未发现新的 P0。

## Spec 轴：上轮 7 条逐项核对

### 1. 已修｜P1：错误态 / closed 态 Terminal Tab 不可关闭

文件：`plugins/deepbuddy/src/client/features/terminal/TerminalView.tsx:108-165,216-224,335-339`

`hostTerminated` 与 `closeRequested` 已拆成两个事实。收到 `closed/error` 后只标记宿主状态；用户再点 Tab 的 X，`closeResource()` 会执行 `onClosed(termId)`，不再因一个共用 `manuallyClosed` flag 提前 return。

原触发序列已收敛：打开第 7 个终端收到 `terminal-limit-reached` → 点击 X，Tab 可以移除。

注意：客户端把所有 host `error` 都当成“资源已终止”，仍会在另一条协议路径泄漏活 PTY，见“新缺陷 3”。

### 2. 已修｜P1：reflow 覆盖 dormant dock 宽度偏好

文件：`plugins/deepbuddy/src/client/shell/layout-store.ts:233-261,339-386`

修复点完整覆盖了宽度进入/退出渲染的路径：

- `reflow()` 只在 dock 实际以 split 渲染时 clamp `dockPx`；dock 关闭或 `dockMax=true` 时宽度休眠。
- `openDock()` 在窄窗以 overlay 打开时保留 dormant 偏好；真正进入 split 时才 clamp。
- 退出 dockMax 通过 `reflow({ dockMax:false })` 在当前窗口重新落地宽度。
- `dockAutoClosed` 只记录 shell 因空间不足做出的关闭；窗口重新可容纳 split 时自动恢复。`openDock()`、`closeDock()`、窄窗主动退出 overlay 都会清标志，用户关闭不会被自动重开。

只读 store 复现：

- 1980px 下记住 650px → dockMax → 缩到 1200px并触发 resize → 回 1980px → 退出 dockMax，结果仍为 650px。
- 1440px 下记住 480px → 关闭 dock → 缩到 800px → 回 1440px → 重开，结果仍为 480px。

未发现 `dockAutoClosed` 在 dock 自身 open/close/max/reflow 路径中新增错误；sidebar 的自动恢复仍未实现，见“遗留问题 2”。

### 3. 已修｜P2：隐藏 dock 把 active View 误报为 visible

文件：`plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx:194-227,280-295`

View 的 `visible` 已改为 `dock && view.id === active.id`。Inspector 仍保持挂载，但 dock 隐藏时 Files 不会后台 `ensureRootLoaded()`，Terminal 也不会因为被误报可见而自动创建 PTY或执行 fit。

### 4. 已修｜P2：killer WebSocket 可无限悬挂且无独立收尾

文件：`plugins/deepbuddy/src/client/features/terminal/TerminalView.tsx:126-165`

fresh killer 改为 `intent=kill` 连接，并有 5 秒强制关闭；close 会清 timer，error 会主动 close。该操作需要在 Tab 卸载后继续交付 kill，因此不应被组件 cleanup 立即取消；当前独立连接的最长生命周期已被明确限定，不会再跟随系统网络超时无限累积。

kill-intent 在 host pending resource 上仍存在语义空洞，见“新缺陷 1”。

### 5. 已修｜P2：Files A→B→A、dispose 与未决 Blob 回写

文件：`plugins/deepbuddy/src/client/features/files/store.ts:69-77,122-166,178-204,212-295`

`fresh()` 已从 Session ID 比较改为单调 generation。`watchSession()` 与 `dispose()` 都递增 generation；`loadDir`、`openFile`、`openBinaryFile` 的成功、结构化错误、Promise rejection 及 Blob decode 后路径都检查同一请求代次。dispose 同时清 `watchedId` 并 revoke Store 所有 Blob URL。

只读 fake 结果：A 旧请求 → B → A 新请求先回 → A 旧请求后回，最终仍保持 `/A-new`；binary 请求未决时 dispose，响应回来后 `URL.createObjectURL()` 调用次数为 0。

### 6. 已修｜P2：dockMax 覆盖浮岛外圈 gap

文件：`plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx:208-227`

dockMax 已恢复 `inset:'var(--db-gap)'`。最大化 Inspector 与窗口四边仍保留 10px window ground，不再从普通浮岛状态突然铺满 padding box。

### 7. 已修｜P2：媒体 error 状态没有可达重试入口

文件：`plugins/deepbuddy/src/client/features/files/FilesView.tsx:128-145`、`plugins/deepbuddy/src/client/features/files/store.ts:234-295`

`MediaPreview` 的 error 状态新增显式“重试”按钮，直接调用 `openBinaryFile(path)`；Store 仍把 cached error 视为可重试，而 loading/success 不重复请求。原序列 `readBinary reject → 关闭/重开仍永远 error` 已有可操作恢复入口。

## Standards 轴：本批新增缺陷

### 1. P1｜kill-intent 对 pending resource 无效，仍会生成不可见 PTY

文件：`plugins/deepbuddy/src/host.js:543-583,610-619,793-819`、`plugins/deepbuddy/src/client/features/terminal/TerminalView.tsx:126-165`

`DeepbuddyTerminalManager.close()` 只查 `resources`；但 `resourceFor()` 要先异步 `resolveSessionCwd()`，在这之后才创建 `pending`，最终才把 PTY 放入 `resources`。kill-intent 路由收到连接后直接调用 `close()`，没有 tombstone/待杀意图。

具体触发：

1. Terminal 首连已到 host，`attach()` 正在等待 CWD/persistence；
2. 网络断开，renderer 进入重连空窗；
3. 用户点 X，fresh `intent=kill` 连接到 host；
4. 此时 `resources` 尚无 key，`close()` 静默 return；
5. 原 `resourceFor()` 随后完成，仍 spawn 并登记 PTY。

表现：Tab 已从 UI 消失，宿主 PTY 继续运行并占用每 Session 6 个额度之一，直到 session dispose。只读 manager fake 验证 pending 状态调用 `close()` 后 `killed=0`，随后 resource 仍能创建。违反 `design/FEATURE_MAP.md` 对 Terminal“明确 Kill / 退出清理”的要求，是本轮合入阻断项。

### 2. P2｜attach 只缓冲 message，却会错过 resource ready 前的 close

文件：`plugins/deepbuddy/src/host.js:574-607`

`attach()` 在 await 前安装了 message wrapper，却在 `resourceFor()` 完成、`resource.attach(socket)` 之后才安装 `socket.once('close')`。

具体触发：socket 在慢 CWD lookup 期间关闭。表现：close 已经发生且不会重放；await 返回后仍把 CLOSED socket 加进 `TerminalResource.clients`，随后才注册永远不会触发的 close listener。反复断线/重连会积累 dead client，直到 PTY 被 kill/session dispose。

只读 EventEmitter fake 结果：close 发生后再 resolve resource，得到 `attached=1, detached=0`。同一等待窗口中的 `early[]` 还没有数量上限；慢 lookup 期间连续发送每条不超过 64KiB 的消息，可让缓冲持续增长。

### 3. P2｜host 的非终止 error 被客户端误判为资源已结束

文件：`plugins/deepbuddy/src/client/features/terminal/TerminalView.tsx:115-125,216-224`、`plugins/deepbuddy/src/host.js:584-604`

host 对 bad JSON、unsupported message 或越界 resize 只回复 `{type:'error'}`，并不 kill PTY；client 却对所有 `error` 设置 `hostTerminated=true`。此后点 X 只执行 `onClosed()`，不会发送 kill。

具体触发：超宽终端 fit 出 `cols > 500`，或一次超大 paste 形成 host 不接受的协议消息 → host 回 error 但 PTY 仍 running → UI 进入 error → 用户点 X。表现：Tab 可关闭，但活 PTY 被隐藏并继续占额度。错误协议需要区分“attach/refusal，无资源”与“连接内命令错误，资源仍活着”，不能由一个 `error` 字符串统一推断 ownership。

### 4. P2｜`drainStage` 用字符串相等代替 intent generation，会丢跨 Session 的同值新意图

文件：`plugins/deepbuddy/src/client/dsh/presets.ts:349-395`

`applyStagedPreset()` 用 `this.state.stagedPreset === staged` 判断“当前 stage 是否仍是本次 RPC 携带的 intent”。相同 preset ID 不能区分两个不同时间、不同 Session 的用户意图。

具体触发：

1. blank Session A 选择 preset X，RPC 未返回；
2. 切到 blank Session B，再选择同一个 X；busy guard 允许新的 stage 留下；
3. A 的 RPC 返回；
4. 因两次值都为字符串 `X`，第 377 行把 B 的新 stage 当成 A 的旧 stage 清空，`drainStage()` 无事可做。

只读 fake 实测 RPC calls 只有 `[['A','X']]`，A 变为 X，B 仍为 base，`stagedPreset=null`。这里需要代次/intent token，而不只是 preset 字符串（Primitive Obsession 判断性 smell）。

### 5. P2｜PresetPlane dispose 后仍可由 drainStage 发起新的 host mutation

文件：`plugins/deepbuddy/src/client/dsh/presets.ts:314-327,349-395`

`dispose()` 只退订，没有 disposed/generation guard；任何 in-flight mutation 完成后仍会 `setState()`，并可能调用 `drainStage()` 启动下一次 `presets.select()`。

具体触发：选择 X，RPC 未回 → busy 期间再选择 Y → 插件卸载/热重载 → X 返回成功。表现：旧 PresetPlane 在 dispose 后继续向 host 提交 Y，并修改废弃 store。只读 fake 实测调用序列从卸载前的 `['x']` 变成卸载后的 `['x','y']`。违反所有 listener/async resource 必须随插件生命周期收敛的规则。

`drainStage()` 本身不会发生同步递归爆栈：下一次 apply 在首次 await 前会先把 `presetBusy=true`；确定问题是意图代次与 dispose 生命周期，而非递归深度。

### 6. P2｜“500 落地”保留旧 Content-Length，客户端仍收到 aborted

文件：`plugins/deepbuddy/src/host.js:245-290,780-786`

已知 size/range 的媒体响应在打开 stream 前已设置原文件或 range 的 `Content-Length`。ReadStream 随后在 headers 尚未发送时 error，代码执行 `writeHead(500); end()`，但没有移除/改写旧 Content-Length；最终发出 `500 + Content-Length:N` 和 0 字节 body。

具体触发：文件 stat 成功后、`createReadStream` open 前被删除或权限撤销。表现：客户端先看到 500 header，随后因 body 长度不足触发 `aborted/terminated`，仍不是一个完整的 500 响应。只读本机 HTTP 复现：`status=500, content-length=100`，body 事件为 `aborted`。

### 7. P3｜关键回归测试仍未覆盖真实时序

文件：`plugins/deepbuddy/tests/plugin.test.mjs:460-477,566-604`

- dockMax 宽度测试在 474-475 行只修改 `innerWidth`，没有在 1200px 时调用 `onResize()`；旧的“浮层期间 resize 会钳宽”实现也可能通过这一段。
- Terminal 测试仍主要检查 bundle 中存在 WebSocket、kill 字样；没有覆盖 pending attach、kill-intent tombstone、close-before-ready、host error 资源语义。
- Files generation/dispose 与 Preset drainStage 没有行为测试。本轮上述两个 Preset 竞态和 Terminal P1 在 65 项全绿时仍存在。

## 当前仍未修的已知遗留

这些不是 `f76c741..b12be43` 新引入，但会影响“最终是否收敛”的判断。

### 1. P1｜关闭最后一个 Inspector Tab 仍不收起 dock

文件：`plugins/deepbuddy/src/client/shell/layout-store.ts:431-440`

`closeTab()` 只写空 ledger，仍不在 `items.length===0` 时令 `dock=false`。

触发：Terminal/Browser 只剩一个 Tab → 点击 X。表现：`items=[]` 但 `dock=true`，留下空右列，违反 `design/DESIGN_INTENT.md:218-225` 的明确规则。只读 store 复现状态仍为 `dock:true, active:null`。

### 2. P2｜dock 会自动重开，sidebar 仍不会

文件：`plugins/deepbuddy/src/client/shell/layout-store.ts:200-202,233-247`

新 `dockAutoClosed` 只覆盖右列；窗口低于 860px 时 sidebar 被 `onResize()` 写成 false，没有对应的 auto-closed 标志或增长后恢复路径。

触发：1440px 左右列均开 → 缩到 800px → 拉回 1440px。表现：dock 会恢复，sidebar 仍保持关闭。只读 store 输出为 `sidebar:false,dock:true`，仍未满足“临时响应式收列不覆盖用户布局意图”。

### 3. P2｜binding 超过 5 秒仍永久漏订阅，新增日志没有修行为

文件：`plugins/deepbuddy/src/client/dsh/adapter.ts:320-364`

50 次 100ms 轮询结束后仍停止；binding hydration 不会重发 list 事件。`b12be43` 只增加 `dbwarn`。

触发：冷启动或慢恢复让 `binding(current)` 在 5 秒后才出现，且 current 不变。表现：`sessionStarted` 长期为 false、dock gate 消失；现在日志可诊断，但功能仍需无关 list 事件才能恢复。

## 五个提交的结论

- `35155c3`：dockMax 浮岛 gap 修复正确。
- `8000053`：错误态 Tab、主 socket 早期 message 缓冲和 killer 超时方向正确，但 kill-intent 没覆盖 pending resource，attach 也没缓冲 close；Terminal 协议仍未闭环。
- `4c4a3ad`：hidden visible、宽度休眠与命令式 loadURL 修复有效；未发现新的 layout reflow 状态错误。
- `73b5584`：Files generation/dispose 修复完整；Preset `drainStage` 新增同值 intent 与 dispose 竞态。
- `b12be43`：dock 自动重开、真实 sidebar width、主题双源监听有效；媒体 500 的响应长度未闭环，且 sidebar 自动恢复仍缺失。

## 验证证据与边界

- `node --test tests/plugin.test.mjs tests/host.test.mjs`（`plugins/deepbuddy`）：**65 tests，65 pass，0 fail**。
- `pnpm typecheck`（`plugins/deepbuddy`）：通过，`tsc --noEmit` 无报错。
- `git diff --check f76c741..b12be43`：通过。
- 只读 fakes：验证 layout 宽度 650/480 保持；Files ABA 最终为 `/A-new` 且 dispose 后不创建 Blob；复现 Terminal close-before-ready 得到 `attached=1,detached=0`；复现 pending kill 得到 `killed=0`；复现 Preset A/B 同值 stage 只调用 A；复现 dispose 后 drain 发出第二次 select；复现 500 保留 Content-Length 后客户端 `aborted`。
- 没有运行会先 build、写 `lib/` 的 `pnpm test`，以遵守 review-only；直接运行了现有 Node tests 和 `tsc --noEmit`。没有做真实 Electron/webview/PTY 端到端，因此视觉与原生 hit-test 结论限定为当前源码、设计规格、store/manager fake。
- Nowledge 定向线程检索返回 503；本报告依据当前 checkout、项目设计文档、上轮报告与只读复现。

## 总体评价

七条上轮新增问题已经逐项修到对应代码路径，说明 width state、Files generation 和 View keep-alive 的 owner 方向已基本正确；但 Terminal 关闭协议仍缺“pending creation 可取消/可记忆 kill intent”这一层资源状态，当前仍可能在 UI 已收敛后创建宿主资源。PresetPlane 又用字符串值代替意图代次，并缺 dispose fence。加上最后一个 Tab 不收 dock这一条已知 P1，当前 HEAD 不能判定为可合入。建议至少清零 Terminal pending-kill P1、最后一个 Tab P1，并为 Terminal/Preset 增加行为测试后再做一次短复核。
