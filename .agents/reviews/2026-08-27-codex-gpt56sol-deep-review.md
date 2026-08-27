# DeepBuddy 只读深度体检报告

审查基线：`ea6cd65..HEAD` 实际包含 5 个 commit；若把起点 `ea6cd65` 的视觉 v2 一并计算，才是 6 个。未修改任何文件。

## P0

未发现可确认的丢数据或崩溃级问题。

## P1｜功能错误

1. Files 的异步响应会跨 Session 回写

   文件：[store.ts:123](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/features/files/store.ts:123)、[store.ts:139](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/features/files/store.ts:139)、[store.ts:169](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/features/files/store.ts:169)

   触发：在会话 A 展开目录或读取文件，请求尚未返回时切换到会话 B，随后 A 的响应完成。三个请求路径都只在发起时读取 `watchedId`，完成时没有 epoch/session 校验。

   表现：B 的 store 会出现 A 的 `fsRoot`、目录项或文件正文。只读 fake 已复现 `sessionId: "B"` 与 `fsRoot: "/workspace-A"` 同时存在；若 A/B 有相同路径，A 的正文还会阻止 B 再发起读取，直接展示错误会话的数据。

2. Terminal 的关闭操作不是原子的，既可能留下僵尸 Tab，也可能泄漏宿主 PTY

   文件：[TerminalView.tsx:98](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/features/terminal/TerminalView.tsx:98)、[TerminalView.tsx:172](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/features/terminal/TerminalView.tsx:172)、[host.js:557](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/host.js:557)

   触发一：断网或 host 未就绪时新建终端，WebSocket 仍为 `CONNECTING` 就点关闭；代码只等待一次 `open` 后才调用 `onClosed`。若连接先失败，`manuallyClosed=true` 又禁止重连，Tab 永远留在界面。

   触发二：连接掉线后的 800ms 重连窗口内点关闭；此时 `socketRef=null`，客户端直接移除 Tab，没有发出 `kill`。宿主在 socket detach 时特意保留 PTY，仅收到 `kill` 或 session dispose 才释放。反复操作可占满每会话 6 个终端额度，而界面中看不到对应 Tab。

3. 关闭 dock 会真实卸载整个 Inspector，内部 keep-alive 失效

   文件：[ThreeColumnFrame.tsx:142](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx:142)、[ThreeColumnFrame.tsx:367](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx:367)、[BrowserView.tsx:35](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/features/browser/BrowserView.tsx:35)

   触发：Browser 中形成历史、填写表单或滚动页面，然后关闭再打开 dock。

   表现：虽然各 Inspector View 和 Tab 内部用 `display:none` 保活，但外层 `{dock && sessionStarted && <InspectorColumn />}` 直接卸载整棵树。Browser 的 Map 只保存 URL 和输入框，重建 webview 后历史、表单、滚动位置全部丢失；xterm 也会销毁并重新附着。这正是“局部 display 保活、外层条件挂载把它抵消”的同类模式。

4. Browser 任意主框架加载失败都会销毁当前 guest 与历史

   文件：[BrowserView.tsx:152](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/features/browser/BrowserView.tsx:152)、[BrowserView.tsx:222](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/features/browser/BrowserView.tsx:222)

   触发：浏览若干页面后输入一个 DNS 不存在、证书错误或离线时无法访问的地址。

   表现：所有非 `-3` 主框架错误都设置 `failed=true`，渲染分支随即用拒绝卡替换并卸载 webview。原 guest 的历史被销毁，工具栏“后退”调用的对象已经是 `null`；同时所有错误都被误报成“该站点拒绝嵌入”，并非只有 X-Frame-Options/CSP 拒绝。

5. 拖宽 sidebar 后不会重新评估 split/overlay，主列可被压到 460px 以下

   文件：[layout-store.ts:516](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/shell/layout-store.ts:516)、[geometry.ts:91](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/shell/geometry.ts:91)、[geometry.ts:123](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/shell/geometry.ts:123)

   触发：窗口宽 1200px、sidebar 268px、dock 分栏打开，然后把 sidebar 拖至 380px。

   表现：拖拽结束只执行 `clampDockWidth()`，不重新调用 `canSplitDock()`；dock 最低仍为 416px，主列实际只剩约 364px，却不会切换 overlay 或收起，违反主列保留 460px 的几何约束。

6. 关闭最后一个资源 Tab 后 dock 不会自动收起

   文件：[layout-store.ts:422](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/shell/layout-store.ts:422)、[TerminalView.tsx:285](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/features/terminal/TerminalView.tsx:285)

   触发：Terminal 或 Browser 只保留一个 Tab，然后关闭它。

   表现：`closeTab()` 只清 ledger，没有在 `items.length===0` 时关闭 dock；右列留下“点击 + 新建”的空面板，违反“最后一个 Tab 关闭后右列自动收起”的现行规则。

7. 首次使用 `⌘/Ctrl+J` 开 dock 无效

   文件：[layout-store.ts:205](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/shell/layout-store.ts:205)、[layout-store.ts:380](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/shell/layout-store.ts:380)、[App.tsx:62](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/app/App.tsx:62)

   触发：启动后从未打开过任何 Inspector pane，直接按 `⌘J`/`Ctrl+J`。

   表现：键盘路径调用无参数 `toggleDock()`，此时 `state.pane` 和 `fallback` 都为空，整次按键无状态变化；按钮路径会传 `firstView.id`，两条入口行为不一致。

## P2｜边界、竞态与泄漏

1. Sidebar 宽度和 dock 已修 bug 属于同一类 DOM 旁路问题

   文件：[ThreeColumnFrame.tsx:53](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx:53)、[ThreeColumnFrame.tsx:323](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx:323)、[layout-store.ts:516](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/shell/layout-store.ts:516)

   触发：把 sidebar 拖至 350px，收起，再展开。

   表现：宽度只写在当前 DOM 上，没有 `sidePx/repinSide`；收起卸载节点后，新节点按 React 声明的 `METRICS.sidebar` 回到 268px。普通同 props 重渲染未必覆盖手写值，但重挂载必然丢失。

2. 响应式自动收列不可逆，手动和自动关闭状态没有区分

   文件：[layout-store.ts:141](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/shell/layout-store.ts:141)、[layout-store.ts:186](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/shell/layout-store.ts:186)

   触发：1440px 下打开 dock，缩窄到分栏不可用，再拉回 1440px。

   表现：dock 被自动设置为关闭后不会恢复；`userClosedDock` 只写不读，因此实现无法区分“用户关闭”和“响应式临时关闭”。Sidebar 在 `<860px` 自动关闭后同样不会恢复。

3. Session binding 只重试一个 microtask，较慢 hydration 会永久漏订阅

   文件：[adapter.ts:312](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/dsh/adapter.ts:312)

   触发：恢复持久化会话时，list 的 `current` 先出现，而 `binding(current)` 在两个以上 microtask 后才可用。

   表现：第一次将 `watchedSessionId` 设为当前 ID 并排一次 microtask；第二次仍无 binding 时条件已不成立，不再重试，也未订阅 session。该会话即使已启动，`sessionStarted` 仍可能长期为 false，dock 消失，直到另一次 list 事件碰巧触发同步。

4. 媒体 Blob URL 的清理 effect 捕获不到异步创建后的 URL

   文件：[FilesView.tsx:126](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/features/files/FilesView.tsx:126)、[store.ts:214](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/features/files/store.ts:214)

   触发：走 base64 fallback 预览图片或视频，等待加载完成后关闭 Tab或切换会话，重复多次。

   表现：cleanup effect 只依赖 `[store,path]`，首次运行时 URL 尚为空，异步写入 `mediaBodies` 后 effect 不重跑；卸载时只会 revoke 当初捕获的 `null`，Blob 内存持续累积。

5. 二进制预览请求拒绝后永久停在“读取媒体…”

   文件：[store.ts:183](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/features/files/store.ts:183)

   触发：`readBinary()` 在 Session 销毁、IPC 中断等情况下 reject，而不是返回结构化 error。

   表现：Promise 只有 `.then()` 没有 `.catch()`，产生未处理 rejection，`mediaBodies[path]` 保持 `'loading'`，该路径之后也不会重试。

6. Brand slot 注入 disposer 被丢弃

   文件：[adapter.ts:288](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/dsh/adapter.ts:288)

   触发：插件卸载、热重载或 scope 重新 apply。

   表现：`slots.inject()` 返回的 disposer 没有放入 `ctx.effect`，旧注入无法随插件生命周期成对释放；重复加载可积累旧 injector/brand 注册。相邻的 layout、theme、header slot 都使用了 effect disposer，这一处是孤例。

7. Browser 诊断日志会记录完整敏感 URL

   文件：[BrowserView.tsx:152](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/features/browser/BrowserView.tsx:152)、[log.ts:31](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/log.ts:31)

   触发：带 OAuth code、签名查询串或临时访问 token 的 URL 加载失败。

   表现：始终开启的 `dbwarn` 把完整 `validatedURL` 写入控制台，而注释又明确这些日志会进入现场报告；查询凭证随日志外泄。

## P3｜可维护性与测试脆弱性

1. “keep-alive”测试存在已证实的假阴性

   文件：[plugin.test.mjs:187](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/tests/plugin.test.mjs:187)、[ThreeColumnFrame.tsx:367](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx:367)

   失败场景：外层新增或保留条件挂载，内部仍包含 `display: visible ? ...` 字符串。

   表现：测试继续通过，但 Inspector 实际已卸载。本次只读测试 31/31 通过，仍未发现上面的 P1 keep-alive 破坏，证明它只能检查源码形状，不能验证生命周期结果。

2. app-region 正确性依赖 paint-order 和全局选择器约定，测试没有真实命中验证

   文件：[ColumnFrame.tsx:95](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/shell/ColumnFrame.tsx:95)、[tokens.ts:275](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/src/client/ui/tokens.ts:275)、[plugin.test.mjs:613](/Users/byron/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy/tests/plugin.test.mjs:613)

   失败场景：官方 UI 升级后在顶栏加入没有原生标签或 ARIA role 的 `div onClick` 控件，或改变顶栏/Panel 的叠放顺序。

   表现：控件不命中全局 `no-drag` 选择器，点击会变成拖窗。当前现有按钮、输入框和 resize handle 未发现确定死角，但测试只统计 `drag`/`NO_DRAG` 字符串数量，无法验证 Electron 的实际 hit-test 和 portal 覆盖。

## 专项结论与验证边界

`freezeDockEmbeds` 自身保存并恢复 width/min/max/pointerEvents，pointerup、cancel、lost capture、blur 均汇入同一个清理路径；Browser 的 webview listeners、xterm 的 `ResizeObserver`/timer/addon 也有对应 cleanup。当前确认的问题不是这些局部 disposer 缺失，而是外层卸载语义和异步请求栅栏破坏了它们预期的生命周期。

验证方面：`node --test plugins/deepbuddy/tests/plugin.test.mjs` 为 31/31 通过；`git diff --check ea6cd65...HEAD` 通过。完整 `pnpm test` 会写构建产物，host 测试还需要创建临时目录，均受本次只读约束阻止，因此未做完整构建与 Electron 端到端拖拽验证。Nowledge 定向检索返回 503，本报告结论均以当前源码、设计文档和只读复现为准。

## 总体架构健康度

整体为“分层方向正确，但生命周期边界尚未收敛”。静态 Catalog、DSH Adapter、集中 Session fence、视图与资源拆分的主架构清晰，局部监听器清理也普遍规范；但 Shell 仍同时依赖 React 状态、模块级 Map 和手写 DOM 三套生命周期，导致 keep-alive、宽度和响应式偏好在重挂载处断裂。Files 缺少统一的请求代次栅栏，Terminal 的 View/Resource 关闭协议也没有做到一次操作同时收敛 UI 与宿主资源。现有测试偏源码字符串契约，无法阻止上述回归。在 P1 清零前，不宜把这批密集改动视为已完成行为收敛。

<oai-mem-citation>
<citation_entries>
MEMORY.md:28-38|note=[DeepBuddy layout preferences and prior validated architecture]
MEMORY.md:42-44|note=[Known failure modes and dirty worktree constraints]
</citation_entries>
<rollout_ids>
01a028e4-d72a-73d1-be72-32c06c29e35b
</rollout_ids>
</oai-mem-citation>
