# DeepBuddy 复审报告：ea6cd65..f76c741 五项修复逐项核对

- 日期 / agent：2026-08-27 / glm-5.3-flash（复审）
- 方法：精读 `git diff 4117ba3..f76c741` 全部源文件改动后的最终状态（layout-store / ThreeColumnFrame / App / adapter / presets / TerminalView / BrowserView / FilesView / files store / host.js / main.js / tests），对照前次 review 报告逐条判定；另跑 `pnpm typecheck`（通过）与 `pnpm test`（**65/65 通过**，含改写后的宽度所有权与 ⌘J fallback 行为断言）作为佐证。无任何仓库写入。

---

## 一、前次 findings 逐项裁定

### 已修（9 条）

| Finding | 修复位置 | 核对要点 |
|---|---|---|
| **P1-1** 媒体 blob URL 被 view 卸载 revoke 后缓存指向死链 | `features/files/FilesView.tsx:121-133`（删除 view 侧 revoke effect，注释改为「store-owned, revoked by the session fence, NOT here」）；`files/store.ts:126-137`（`watchSession` 同步 revoke 所有 `blob:` 前缀条目后清缓存）；`store.ts:254-258`（跨会话晚到的 stale decode 创建即 revoke） | 重开已关标签命中缓存渲染正常（缓存不再是死链）；blob 所有权单一化为 store；`kind:'url'` 的 HTTP 分支不被误 revoke（`startsWith('blob:')` 过滤，store.ts:132）。**修法正确** |
| **P1-2** 侧栏拖拽宽度在收起/展开 remount 后静默归位 268px | `layout-store.ts:110`（`sidePx` 入 state）、`494-505`（拖拽期间仍直写 DOM 作 fast path，释放时一次性 `reflow({sidePx})` 提交）；`ThreeColumnFrame.tsx:70,76`（React 从 state 渲染 width） | remount 后宽度从 state 回放，丢失路径不存在。dock 同构收敛：`dockPx` 入 state（layout-store.ts:111）、split 样式 `flex: 0 0 ${dockPx}px` 直接来自 state（ThreeColumnFrame.tsx:224），`repinDock`/手写 pin 补丁整体删除且 grep 无残留 |
| **P2-1** 侧栏开合不触发 dock 钳制，会话列可被压穿 460px 保底 | `layout-store.ts:225-241`（新的 `reflow()` 把「dock 失配关闭 + dockPx clamp」统一为所有预算变化的出口）；`toggleSidebar`→`reflow`（:305-309）、`resetSideWidth/resetDockWidth`→`reflow`（:507-530）、`startSideDrag` 提交→`reflow`（:504） | 几何不变量现在全路径生效（resize / 开合 / 提交三个入口共用一个函数，单次 patch 单次通知）；side 计算先于判断消费 patch 内待提交值（:228），无二跳误差。测试用 1200px + 380px 侧栏直接断言 split 会关闭而非挤压会话 |
| **P2-2** FilesStore 三处 async 回写缺会话围栏校验 | `files/store.ts:145-147`（`fresh(id)`）、`168,180`（loadDir 两分支）、`202,206`（openFile then/catch）、`223,265`（openBinaryFile） | 每处 await 之后写态前均校验 `watchedId === id`，与布局侧栅栏对称。附带两处正向改进：cached error 不再挡重试（:197-198,218-219）；transport rejection 落成可渲染 error 而非永久 loading（:264-272） |
| **P2-3** binding 未水化只 poll 一次 microtask，dock 门可能永久关死 | `dsh/adapter.ts:314,329-351`（`bindingPoll`：100ms × 50 次 bounded interval，绑定到位后清表并补跑 `syncSessionStarted`） | 细看通过：① 会话切换路径先清旧 poll 再按需新建（:329-332），不会轮询过期 `cur`；② ctx.effect dispose 三件套齐清（offList/sessionOff/bindingPoll，:356-360）；③ 尾部到达后重新进入订阅分支（`cur===watchedSessionId && sessionOff===undefined` 成立）→ 正确挂上 session.subscribe；④ 有界（5s）不留常驻定时器。残余边界：>5s 才水化的部署仍会错过门开（无后续再试点），量级可接受且远优于单 microtask |
| **P2-4** xterm 主题只读一次，浅色主题下终端黑屏残留 | `terminal/TerminalView.tsx:72-84`（`readTheme()` 每次现读 token）、`:98-101`（MutationObserver 盯 body `data-ds-dark-theme` 属性翻转即重灌 `terminal.options.theme`）、`:231`（cleanup disconnect） | 与 theme-presenter 的开关变量精确对应（DARK_ATTRIBUTE 同名 attr）；observer 生命周期成对。深色↔浅色来回切换终端画布即时跟随 |
| **P3-2** CONNECTING 期关标签遇连接失败，标签永卡「正在连接…」 | `TerminalView.tsx:108-145`：`closeResource` 对 CONNECTING socket 同时挂 `'open'` 与 `'close'` once-listener，`finished` 单闸防重入；两条终止路径都执行 `onClosed(termId)` 收掉标签 | 卡死序列消除。新增的「socket 已死时开 killer 连接补发 kill」（:113-128）有 try/catch 与 error 兜底，宿主保留 PTY 至显式 kill 或会话销毁的原契约不破坏 |
| **P3-3** 断线重连固定 800ms 无上限 + dbwarn 刷屏 | `TerminalView.tsx:215-218`（指数退避 800ms·2^n，cap 15s；成功 attach 归零 attempts :184；前 3 次 dbwarn、之后降 dblog） | **细看通过**：退避时钟以 snapshot 到达为准（不是 socket open），与「真正连上」语义一致；timer 生命周期沿用原有 cleanup（:229） |
| **P3-4** ⌘J 冷启动哑弹 | `app/App.tsx:81-83`（组装层把 catalog 首视图注入 `layout.dockFallback`）；`layout-store.ts:151,203-206`（keydown 改调 `toggleDock(this.dockFallback ?? undefined)`，另顺手放行 ⇧/⌥ 和弦不再劫持 DevTools 快捷键） | store 不识 catalog 的原则保持（fallback 是 string，注入在组装层）；测试覆盖「从未开过 pane 的 fresh store 按 fallback 打开」 |

### 并入以上提交一并修掉的 P3（2 条）

- **P3-5 部分**：浏览器失败卡改为「盖在存活 guest 之上的浮层」（`BrowserView.tsx:84-101,249-261`），webview 不再被替换销毁——刷新按钮对失败页失效的问题随 `webview?.reload()` 保住引用自然消失；`did-fail-load` 日志脱敏为 host-only，防止 OAuth code/签名串进 field report（:182-184）。iframe fallback 的 X-Frame-Options 白屏盲区**未修**（该分支 `onLoad` 仍无条件 `setFailed(false)`，:270）——非 Electron 退化路径，可接受。
- **P3-6**：栅栏清缓存的 blob 泄漏随 P1-1 的所有权重构一并消失（`watchSession` revoke，store.ts:131-135）。
- **P3-8 部分**：媒体文件双重拉取消除（`FilesView.tsx` onOpen 对 `mediaKind(child.path)!==null` 跳过文本读取）。

### 部分修复（2 条）

- **P3-1** 死状态：`title` 字段与 `setTitle` 已整体删除（LayoutState/grep 双确认），`setView` 的多余条件收窄；但 `view` 字段与其唯一消费者 ChatNav 仍保留——语义收窄为「新建任务时清 sessionStarted」，冗余减半，未完全退役。
- **P3-7** 脆弱隐式约定：tokens.ts 对官方 hash 类名的子串匹配 CSS 原样（升级即破相的静默契约依旧无启动断言）；测试里 `repinDock` 一类最脆的文本断言被改写成行为级（好），但 `plugin.test.mjs:187-213` 附近的源码正则群仍在。定性：缓解未根治。

### 误修（0 条）

未发现将任何 finding 修错方向的改动。

### 顺带的新增修复（超出我前次清单，均已核对无误）

- **host P0**：`src/host.js:248-260` `streamFile` 把 ReadStream `'error'` 先注册后 pipe、500/destroy 单响应；`:765-771` 拒绝的 promise 落 500 而非未处理拒绝炸死宿主进程；Origin:null 显式按 foreign 处理（:805 起）。三处防御准确。
- **main.js:152-156**：spawn dsh 加 `detached: true`，让 quit 时 `process.kill(-child.pid)` 的进程组击杀真的指向子组（此前 ESRCH，PTY shell 可能超生）。与 `killChild` 闭环核对一致。
- **presets 暂存补跑**：`presets.ts:384` 在 apply 成功收尾时补跑 staged pick。可达性核对——`startCreatorSession`（:434）绕过 busy 守卫直写 `stagedPreset`，竞窗口真实存在，此 hook 有效；`selectPreset` busy 期丢弃点击的行为保持原状未扩大。已在 test 增设断言面。
- browser `<webview>` 加 `partition="persist:dbdy-guest"`（BrowserView.tsx:259）：guest cookie/storage 与应用主会话隔离，main.js 的 webContents handler 覆盖所有分区不受影响。

---

## 二、指定重点：是否引入新缺陷

### A. BrowserView `src` 非受控化后的导航状态同步 — 核对通过

改动意图（BrowserView.tsx:124-128 注释明示）：guest 自己发起的导航（点链接、SPA pushState）只经 `sync`（:167-177）更新 `url/input/persist`，**绝不回写 `src`**，从而消灭「每次来宾导航都全量重载一遍」与「pushState 被放大成整页加载」。逐路径核对：

- 来宾导航 → did-navigate/did-navigate-in-page → `url` 变、`src` 不变 → React 属性 diff 为空 → 不重载 ✅
- 地址栏 Enter → `navigate()` 三态齐写（input/url/src）+ persist（:148-158）→ 显式导航照旧生效 ✅
- 后退/前进/刷新/重试全部走 webview 实例方法（:217-224,260），依赖的是 guest 内部历史而非受控 src，失败卡覆盖下仍可重试 ✅
- keep-alive 恢复（dock 关再开）：Pane 不卸载，src 无从漂移；栅栏 remount 用持久化 `initial.url` 重建 webview，行为正确 ✅
- 非 Electron iframe 分支维持受控 `src={url}` 且无导航监听，`url` 只经 `navigate()` 写——与旧版行为等价，无回归 ✅

残留 nit（非回归）：地址栏显示的是页面实际 URL，用户手动敲同一 URL 回车时 `next !== src` 会触发一次内容相同的重载；以及失败导航发生后 后退/前进 按钮到下一次成功导航才刷新可用态。均为旧行为延续或一闪而过。

### B. blob URL 会话围栏 revoke 时机 — 核对通过，一处 nit 级残缝

- 切会话：`watchSession` 在**同一个同步 tick 内**先 revoke 后清态再 notify（store.ts:131-136），uSES 批渲染下已挂载的 `<img>` 不存在渲染 revoked URL 的窗口（重绘发生在状态清空之后）✅
- 晚到的 stale base64 解码：创建即查 `fresh`，不过期立即 revoke（:254-258），字节流与对象都活不过这一个 tick ✅
- HTTP url 分支不会被 `revokeObjectURL` 误伤（blob: 前缀过滤）✅

nit：极端序列「开图 → 切走 → 立刻切回同一会话（`watchedId` 回到原 id）→ 旧代次的 in-flight 响应此时通过 `fresh()` 校验写入新缓存」时，新请求若也在途会发生覆盖，被覆盖的 blob 不回收——单个 URL 量的确定性小泄漏，仅在毫秒级手速下出现，不值得为此加代次号。

### C. 其他新改动扫查（reflow 引擎 / 持久挂载 dock / EDGE_STRIPS）

- **`reflow()` 单通知不变量引擎**（layout-store.ts:225-241）：逻辑核对无误——`patch` 先消费待提交值算 side，no-op key 以恒等剔除（此处只有原始类型字段），终态单次 patch。未发现能把状态推入不一致组合的入口组合（overlay 态下 dock 关闭守卫有 `!state.dockMax` 保护，`toggleDockMax` 自带闭合路径）。
- **dock 由「关=卸载」改为「关=display:none」**（ThreeColumnFrame.tsx:208-213,392-402）：这一刀其实把实现拉回了 AGENTS.md 既定基线「收起右列不得终止 Terminal」——旧代码关 dock 会 unmount 整列杀掉全部 TerminalPane/webview，前次 review 未点名这一点，属于顺手修正了一个我没抓到的隐性违约。门禁保持：`sessionStarted` false 时整列卸载，空白页不渲染 dock 的规则不变。资源代价是 started-session 生命周期内 kept-alive 内容常驻，与既定 keep-alive 设计一致，非缺陷。
- **EDGE_STRIPS**（ThreeColumnFrame.tsx:48-55,343）：四条 6px 无事件 no-drag 条用于给 macOS 原生边缘 resize 让位。机制上押注「region 收集不受 pointer-events/z-order 影响、按绘制顺序做加减」——与 ColumnFrame.tsx 里「collects app-region rects independent of paint order」的旧注释字面相反（后者本意指负 z 拖拽条也能生效）。两段注释措辞互相矛盾但行为都成立于 Blink 的真实实现；建议某天统一说法，无功能缺陷。
- **⌘J 和弦放行**（layout-store.ts:197）：⇧⌘J/⌥⌘J 不再被吞，属净改善。
- 死代码清理完整性：`repinDock/userClosedDock/setTitle/title` grep 零残留；`EmbedRefusal` 仍被 iframe 分支合法使用。

---

## 三、总结论

| 分类 | 数量 | 明细 |
|---|---|---|
| 已修 | 9（另并入 P3-5/P3-6/P3-8 各一部分） | P1-1、P1-2、P2-1、P2-2、P2-3、P2-4、P3-2、P3-3、P3-4 |
| 部分修复 | 2 | P3-1（title 已删、view 仍在）、P3-7（repin 文本断言改良、hash-class 匹配与源码正则群仍在） |
| 误修 | 0 | — |
| 新缺陷 | 0 | 3 个 nit 级残留已记录：快回同会话覆盖泄一个 blob、同 URL 重敲回车重复加载、X-Frame-Options 下 iframe fallback 仍白屏 |
| 超范围新增修复（核对无误） | 4 | host 流错误 P0、main.js detached 进程组、presets 暂存补跑、⌘J 和弦放行 + guest partition |

修复质量评价：五个提交没有一个是「表面糊补丁」——P1-1 选择了资源所有权上移的正确解而不是再加 revoke 时机补丁；P1-2/P2-1 合并为一次宽度状态化重构并把散落的几何特例收敛进单一 `reflow` 出口，删除了上一版的 `repinDock` 应急物而非叠加它；P2-3 从单 microtask 到有界 poll 的演进带着准确的清理纪律。验证面：typecheck 通过、65/65 测试（其中行为级断言显著增加）。遗留工作集中在两类：测试体系仍以实现文本正则为主（P3-7），以及 tokens.ts 对官方 build-hash 类名的无哨兵依赖——建议下一个迭代把它们排上，其余可安心合入。
