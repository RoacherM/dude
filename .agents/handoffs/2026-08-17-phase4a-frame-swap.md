# DeepBuddy P4a：frame 置换 handoff

- 日期 / agent：2026-08-17 / claude
- 目标：DeepBuddy 从「root shadow 不渲染任何官方插槽」升级为「接管 ui-layout 的
  frame 合同并渲染四个子槽」，把 `shell.overlay` 这个开放面点亮。

## 结论

**frame 合同置换完成，`shell.overlay` 真的开了。** build / test / typecheck 全绿
（deepbuddy 14 条 + terminal-probe 5 条），3081 上视觉与置换前一致，
右缘出现官方工作区抽屉书签、抽屉打开后文件树可用——这是开放面点亮的直接证据。

**与 brief 有两处偏差，都是机制事实层面的，见下面「与 brief 的偏差」：**

1. **创造模式全链路卡在审批，且不是本次改动造成的。** 模型确实写出了双半部终端
   插件并走完挂载流程，最后停在「Client 包需要界面授权」——而**授权控件坐在
   `tool.call.toolview`（P4c 座位）与 `sidebar.footer.action`（P4b 座位）上**，
   P4a 阶段这两个面都还熄灭，界面上没有可点的东西。按 brief 的预案改用手写探针
   `plugins/terminal-probe/` 等价验证，`echo hello` 跑通并截图。
2. **brief 说的「官方工作区抽屉（ui-workspace-shell）走 slots.inject('shell.overlay')」
   只对了一半。** 本 profile 里那个抽屉是 `dsh-plugins/plugins/workspace-shell`
   —— 我们自己的移植版，它注册进 `shell.overlay` 但**不声明** `workspace.drawer/
   tree/terminal/outputs/tab-content` 这些子座位。官方
   `@deepseek-ai/dsh-client-ui-workspace-shell` **没有发布到 npm**（`npm view` 404），
   所以宪章里「工作区抽屉」那一行开放面，在当前 profile 里没有任何插件声明它。
   详见「遗留」。

---

## 改了什么

### 1. `plugins/deepbuddy/cordis.patch.yml` —— R1 换行不改包

顶层加一条，官方包一行没动：

```yaml
- id: ui-layout
  disabled: true
```

composed config 实测（`--dump-config`）：

```text
# == @deepseek-ai/dsh-web-app, patched by dsh-plugin-deepbuddy
- id: ui-layout
  name: '@deepseek-ai/dsh-client-ui-layout'
  disabled: true
# == @deepseek-ai/dsh-web-app
- id: ui-sidebar
```

`ui-sidebar` / `ui-conversation` **没动**——那是 P4b / P4c。

### 2. `src/client/AppFrame.tsx` —— 状态所有者上移

`DeepBuddyFrame extends Component` → `class FrameController`（插件级）。
**每个动作的函数体一行没改**，换的只有宿主：

- `setState(update, after?)` 自己实现，保留 React 的两种调用形状
  （partial / updater，updater 可返回 `null` 表示不改），因此
  `patch` / `patchCopy` / `toggleMax` 这些原样搬过来即可。唯一行为差异是
  **同步生效**，这只会让 read-after-write 更正确，不会更差。
- `subscribe` / `getVersion` 是 uSES 对；`componentDidMount/WillUnmount`
  → `mount()/dispose()`，挂在 `ctx.effect` 上而不是 React 挂载上——
  状态现在比任何单个 slot entry 的树活得久。
- `export type DeepBuddyFrame = FrameController`：**Sidebar / Conversation /
  WorkspacePanel / SettingsDialog 四个组件零 diff**，它们 import 的那个名字
  仍然指向它一直指的东西（它们从来没把它当 React 组件用过）。

同文件新增三个 slot 组件：

| 组件 | 注册进 | 渲染 |
|---|---|---|
| `createChrome(frame)` | `root`（`ROOT_PRIORITY = -1`）+ 四子槽声明 | DeepBuddy 网格几何 + 四个 `renderSlot` + 工作区面板 + 设置弹窗 |
| `createSidebarRoot(frame)` | `sidebar`（`priority: -1`） | `<Sidebar frame={frame} />` |
| `createConversationRoot(frame)` | `conversation`（`priority: -1`） | `<ConversationPane frame={frame} />` |

几何未变：`geometry.ts` 一行没动，工作区面板仍然是 chrome 内联渲染（它在官方
frame 里没有对应合同，所以没有合同要守；官方的工作区表面走 `shell.overlay`）。
`details` 列默认宽 0、子树保持挂载，由 `ctx.layout.openDetails/closeDetails` 驱动。

### 3. `src/client/theme.ts` —— 重实现 theme presenter

ui-layout 一禁用就没人把主题投到 DOM 上，`--dsw-*` 的消费者（抽屉、任何开放面
里的生态插件）会永远读浅色底板。照官方 `theme-presenter.ts` 重写（purity 禁止
跨插件值导入，官方文件只能当只读参考），行为逐条对齐，包括「只撤销自己写过的
东西」这条纪律。

实测证据（浏览器里读 DOM）：

```json
{"themeColorMetas":["rgb(21, 21, 23)"], "darkAttr":true, "colorScheme":"dark",
 "bgBase":"rgb(21, 21, 23)", "prefersDark":true}
```

`meta[name=theme-color]` 只有 presenter 会创建（首页那段 inline boot 脚本只设
`data-ds-dark-theme`，不建 meta），所以它的存在本身就是 presenter 活着的证据。

### 4. `src/client/index.tsx` —— 装配顺序

`provide('layout')` → theme presenter → styles → frame controller → root 注册
（带四子槽）→ 两个占用者。`inject` 加了第五项 `theme`。

`ctx.layout` 的实现只有三个方法，直接委托给 FrameController——官方那套
store/inject 机制是因为它的几何住在 slot store 里，我们的住在 controller 里，
没有要 attach 的东西。

### 5. `src/client/styles.ts` —— overlay 层

```css
.dbdy-overlay { position: absolute; inset: 0; z-index: 50; pointer-events: none; }
.dbdy-overlay > * { pointer-events: auto; }
```

z-index 取 50 而不是官方的 20：DeepBuddy 自己的 drop-up 是 30、设置弹窗是 60，
50 让浮层盖住内容与 drop-up、但盖不住模态。层必须 click-through，否则一个空层
会吞掉整页的点击。

### 6. `plugins/deepbuddy/package.json`

- devDeps 加 `@deepseek-ai/dsh-client-ui-layout` 与
  `@deepseek-ai/dsh-client-ui-theme`（都是 `0.1.0-rc.6`，只做 type-only import，
  esbuild 擦除，不进 bundle）。**brief 只点了 ui-layout，ui-theme 是必须的补充**：
  ui-layout 编译出的 `client/index.d.ts` 没有带上 ui-theme 的 Context merge
  （`theme-presenter.d.ts` 不在 index 的导出图里），所以 `ctx.theme` 与
  `ThemeSnapshot` 拿不到。两个 pin 都会被 `sync-upstream.mjs` 自动 bump。
- `dsh.client.inject` **去掉** `@deepseek-ai/dsh-client-ui-layout`：同一个插件
  一边 disable 掉那一行、一边声明依赖它，是自相矛盾。实测 loader 容忍悬空边
  （官方 `ui-sidebar` 的 inject 里现在就挂着一条指向不存在的 ui-layout 的边，
  整个 app 照常起），所以去掉是纯净化，不是修 bug。

### 7. `plugins/terminal-probe/`（新增，**可删**）

P4a 验收探针，见其 README。刻意写成任何第三方插件都会写成的样子：
一次 `slots.inject('shell.overlay', …)`，对 DeepBuddy 一无所知，
样式走 `--dsw-alias-*`。host 半部一个 Remote 端点 `terminalProbe/exec`，
经宿主自己的 `ctx.shell`（本 profile 是 `bash-sandbox`）跑前台命令，
15s 超时 / 64KB stdout 上限，探针不自带任何沙箱绕过。

### 8. 文档

- `UPGRADE.md`：新增「## 硬规矩：新插槽未定级不升级」；契约测试表按新的
  14 条重写（bundle patch 面 / frame 合同面 / 占用者影子面 / 顶替 ui-layout 的
  服务面 / 五项 inject）；人工验收清单加一条「开放面还开着」；
  准入第 3 条的「四项 inject」改为五项。
- `ARCHITECTURE.md`：迁移路线的「当前状态」与 P4a 条目更新为实际结果。
- `README.md` / `plugins/deepbuddy/README.md`：「root shadow」的描述改为
  「接管 frame 合同」，补上占用者与开放面的关系。

---

## 实测输出

### 门禁

```
$ pnpm build        → deepbuddy lib/client.js 161.1kb；terminal-probe 5.9kb
$ pnpm test         → deepbuddy 14 pass / 0 fail；terminal-probe 5 pass / 0 fail
$ pnpm typecheck    → 两个包都 Done
```

### 3081 真机（`dsh --profile deepbuddy --port 3081`）

boot 清单：**40 个 entry，`dsh-client-ui-layout` 不在其中**
（只作为 `ui-sidebar` 的一条悬空 inject 边出现），
`dsh-plugin-deepbuddy` / `dsh-plugin-workspace-shell` / `dsh-plugin-terminal-probe` 都在。
console 无 error / warn。

frame 的 DOM 结构（`.dbdy` 的直接子节点）：

```json
["sidebar", "dbdy-hv-accent", "conversation", "dbdy-hv-accent",
 "SECTION", "DIV", "dbdy-overlay"]
```

—— 三个 `data-slot` 包裹层都是 `display: contents`，所以 flex 几何完全没变；
`SECTION` 是工作区面板，`DIV`（宽 0）是常闭的 details 列，
里面挂着官方 ui-conversation 的 DetailsPanel（"Details / Click a tool row…"），
即官方语义的「关闭 = 宽 0，永不卸载」已经在跑。

侧栏折叠 / 展开实测：slot 整体卸载再挂回，拖拽手柄跟着走。

```json
afterCollapse: ["conversation","dbdy-hv-accent","SECTION","DIV","dbdy-overlay"]
afterExpand:   ["sidebar","dbdy-hv-accent","conversation", …]
```

`UPGRADE.md` 的六项人工视觉验收全过：三栏骨架 / 历史消息流 / 真实文件树 /
模式 chip 切换（切到创造模式，hero 与会话头同步）/ 设置两页（真实 roster：
标准·PTC·极简·创造，含默认标记与复制/删除）/ 发消息端到端（创造模式那一轮
真跑通了模型、工具调用与回复）。

### 截图

| 文件 | 内容 |
|---|---|
| `.agents/handoffs/assets/2026-08-17-phase4a-frame-desktop.png` | 置换后的完整界面；**右缘竖排「工作区」书签**就是 `shell.overlay` 点亮的直接证据 |
| `.agents/handoffs/assets/2026-08-17-phase4a-drawer-open.png` | 抽屉打开：全高面板 + 真实工作区文件树 |
| `.agents/handoffs/assets/2026-08-17-phase4a-terminal-probe.png` | terminal-probe 浮窗跑 `echo hello && uname -s && pwd` |
| `.agents/handoffs/assets/2026-08-17-phase4a-settings.png` | 设置弹窗两页仍然正常 |

### terminal-probe 端到端

```
$ echo hello && uname -s && pwd
hello
Darwin
/Users/byron/Desktop/Projects/Devs/deepbuddy
[exit 0]
```

两个 `shell.overlay` 条目并存（抽屉 order 100、探针 order 200），
互不替换——这正是 list 槽「添加而非替换」的语义。

---

## 与 brief 的偏差

### 偏差 1：创造模式验收案例卡在审批，改用等价验证

**做到哪一步**：浏览器里新建任务 → chip 切到创造模式 → 让它写一个最小终端插件
并当场挂载。模型确实：查了整棵实时 slot 树、发现 `workspace.terminal` 未被声明、
按要求退回 `shell.overlay`、写出双半部插件（host 用 `ctx.get('shell')` →
`resolve` → `run`；client 注册 `id: 'mini-terminal', order: 200`）、
定义成 `term-1/pkg-1`、调 `cordis_run`。

**确切卡点**：`cordis_run` 返回 `awaiting-approval`——Client 包需要用户在界面上
授权。而授权控件在官方装配里只有两个落点
（`packages/extensions/ui-cordis/src/client/index.ts`）：

- `sidebar.footer.action` → `CordisPanel`（`onApprove`）——宪章里的**侧栏动作，P4b**
- `tool.call.toolview` keyed `cordis_run` → `CordisRunRow`——宪章里的**工具视图，P4c**

两个面 P4a 都还没点亮，DeepBuddy 的会话面渲染的是自己的工具块，不走
`tool.call.toolview`。所以**界面上没有可点的授权控件**。这不是本次改动造成的
回归：置换前 DeepBuddy 同样一个官方座位都不渲染，授权控件同样不存在。

也试过绕开 UI 直接审批：审批要走客户端服务 `dynamicCordisRunner.approve()`，
而页面上没有暴露 cordis Context（`window` 上只有 `__DSH_BOOT__` /
`__ModuleLoader__` / `__DSH_MODULES__`），没有干净的旁路。

**等价验证**（brief 的预案）：手写同样的最小终端插件
`plugins/terminal-probe/` → `dsh plugin add` → 重启 → 面板出现在 DeepBuddy
界面里 → `echo hello` 跑通。**创造模式全链路列为遗留，解锁点是 P4c（或 P4b）。**

顺带记一个踩坑：探针第一版报
`typert gateway: terminalProbe/exec: Service "terminalProbe" has no visible typertRemote binding`。
Gateway 在调用前会校验 service 上有一个可见的 `typertRemote` 记录，
写 descriptor 是不够的（`packages/api/gateway/src/index.ts` 的 `validateBinding`）。
已在 service 构造函数里补上冻结记录，并加了一条契约测试锁住它——
这是 descriptor 测试看不见的运行期失败。

### 偏差 2：brief 的机制事实第 6 条只对了一半

brief 写「官方工作区抽屉（ui-workspace-shell）走 `slots.inject('shell.overlay')`
等声明，我们声明+渲染后它自动出现（右缘书签 + 抽屉 + 其中的 `workspace.*` 座位，
含终端座位）」。

前半句对：抽屉自动出现了。后半句不对——本 profile 里的抽屉是
`dsh-plugins/plugins/workspace-shell`（我们自己的移植版），它只注册进
`shell.overlay`，**不声明任何 `workspace.*` 子座位**
（`src/client/WorkspaceDrawer.tsx` 里没有 `children` 也没有 `renderSlot`）。
官方 `@deepseek-ai/dsh-client-ui-workspace-shell` 才声明那些座位，而它
**没发布到 npm**（`npm view` 404），这也正是 dsh-plugins 当初要移植的原因。

创造模式那个 agent 独立查了整棵实时 slot 树，结论一致：「没有任何 terminal 座位」。

所以宪章开放面表里「工作区抽屉 `workspace.drawer/tree/terminal/outputs/tab-content`
依赖阶段 P4a」这一行，当前 profile 里**没有任何插件声明它**。frame 不是瓶颈，
frame 已经把 `shell.overlay` 开着了；瓶颈是坐在里面的那个抽屉。见「遗留」。

### 偏差 3（小）：一处「原有断言维持」做不到

brief 说测试「原有断言维持」，但原有的
`assert.doesNotMatch(bundle, /shell\.overlay/)` 与 P4a 的目标直接冲突
（我们现在必须渲染它）。已替换为四子槽 kind/scope 逐条断言 + 四个
`renderSlot` 调用断言；`deepbuddy:shell`（双 shell 切换残留）那半条保留。

---

## 遗留 & 下一步

1. **创造模式全链路**：解锁点是 P4c（`tool.call.toolview` 让 `CordisRunRow`
   的审批控件进入 DeepBuddy）或 P4b（`sidebar.footer.action` 让 `CordisPanel`
   进来）。P4c 做完后重跑本次那条 prompt 即可闭环，会话还在
   （侧栏「给 DeepBuddy 写终端插件并挂载」）。
2. **工作区抽屉的 `workspace.*` 座位**：要真正点亮宪章里那一行，二选一——
   (a) 给 `dsh-plugins/plugins/workspace-shell` 的抽屉补上 children 声明与
   `renderSlot`（它本来就是官方那份的移植，补齐即可，改的是 dsh-plugins 仓）；
   (b) 等官方发布 `@deepseek-ai/dsh-client-ui-workspace-shell` 后按 R1 插一行。
   在那之前，**建议把宪章开放面表里那一行的「依赖阶段」从 P4a 改掉**，
   否则清单在承诺一个当前无人声明的面。这是产品判断，我没有替你改表。
3. **R3 主题桥接现在是肉眼可见的债**：DeepBuddy 的 `--color-*` 写死浅色，
   开放面里的生态内容读 `--dsw-alias-*` 跟随系统深色——抽屉打开时是
   浅色 chrome 里嵌一块黑面板（见 drawer-open 截图）。宪章说 R3 可与 P4a 并行，
   现在它有了具体的视觉代价，优先级应该往上提。
4. **`details` 列没有真实驱动方**：机制就位（宽度、常挂载、`ctx.layout` 三方法），
   但 P4a 阶段没人调 `openDetails`。官方 ui-conversation 的 DetailsPanel 已经
   挂在里面了，P4c 置换会话面时这条链会自然接上。
5. **`plugins/terminal-probe/` 可以删**：它只是让 P4a 的结论可以随时复跑。
   删的话记得先 `dsh plugin --profile deepbuddy remove dsh-plugin-terminal-probe`。
6. **`ROOT_PRIORITY = -1` 现在是纯保险**：ui-layout 行已禁用，没人跟它抢 root。
   留 -1 是为了「万一有人把 ui-layout 补回来」时 DeepBuddy 仍然赢。

## 关键决策与约束

- **接管 frame 合同是全有或全无**：ui-slots 只认一个声明者，所以「disable 官方行 +
  重声明四子槽」必须成对发生，不能只声明自己想要的那两个。这条是 R1/R2 成对
  发生的机制原因，写进了 `cordis.patch.yml` 的注释。
- **不 disable `ui-sidebar` / `ui-conversation`**：它们保持注册，DeepBuddy 用
  `priority: -1` 压过去渲染，官方服务全部存活。摘行是 P4b/P4c。
- **四个组件零 diff**：`export type DeepBuddyFrame = FrameController` 的别名
  就是为了这个。`FrameController` 的动作函数体一行没改。
- **官方包与 `deepseek-harness` / `dsh-plugins` 两仓一行没改**（只读参考）。
- **未 git commit。**

## 复测入口

```sh
cd ~/Desktop/Projects/Devs/deepbuddy

pnpm build && pnpm test && pnpm typecheck     # 期望：14 + 5 pass，typecheck Done

DSH=/Users/byron/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh

# 置换真的落在 composed config 上
"$DSH" --profile deepbuddy --dump-config | grep -A3 'id: ui-layout'
#   期望：name: '@deepseek-ai/dsh-client-ui-layout' / disabled: true

"$DSH" --profile deepbuddy --port 3081
# 浏览器 127.0.0.1:3081：
#   1. 界面与置换前一致（三栏 + 工作区面板 + 设置）
#   2. 右缘竖排「工作区」书签 → 点开 → 文件树可用      ← shell.overlay 点亮
#   3. 右下角 terminal-probe 浮窗 → 输入 echo hello    ← 生态插件可用
```

冒烟脚本（3082，别撞 3081）本次实跑过，四项全 PASS：

```sh
$ node scripts/sync-upstream.mjs --smoke
  [PASS] 首页 + client bundle — / → 200；client.js → 200；ModuleLoader 头 在
  [PASS] agentPreset.list — ok=true；presets=4 [standard, code, minimal, cordis]
  [PASS] session.list → workspaceShell/listDirectory — …；ok=true；7 个条目
  [PASS] boot 清单含两个自有 entry — 40 个 entry；两个自有 entry 都在
✔ 冒烟通过（4 PASS / 0 SKIP）
报告：reports/upstream-sync/2026-08-17.md
```

注意冒烟**验不到本阶段的成果**：它的四项里没有一项会因为 `shell.overlay`
熄灭而变红。开放面的回归只有上面那三步人工步骤和契约测试守着。
