# DeepBuddy 单文件 HTML 原型 handoff

## v5 命令面板（2026-08-25 / claude）

用户指出 composer ＋ 号逻辑不对：原型是自造的「添加文件/添加图片」附件菜单，
真实 ＋ 号（aria-label「命令」）打开的是 slash command 面板。已按真实重建：

- 一级：537 宽，标题「命令」（12px muted），7 条真实命令（compact/export/feedback/
  goal/permission/plan/model），行内 name 白 + 描述 muted 同行，hover bg rgba(255,255,255,.08)。
- 二级（permission/model）：同锚点切换为 351 宽参数面板——顶部搜索框（h31 r8，
  focus 蓝圈 #679EFE，可实时过滤）+ 候选行（value + provider 注记 + check 16）；
  选择后回显 composer 对应按钮。无参命令（compact 等）→ toast 占位。
- 参考数据补进 popovers.json 的 commandMenu 节。
- 验证：一级/二级截图与真实并排一致；过滤「claude」→3 行；选 Claude Opus 5 /
  Read Only 回显正确并恢复默认；compact → toast；JS parse PASS。

## v4 浮层 1:1 重建（2026-08-25 / claude）

用户反馈「这些文件夹页面也不是1:1的还原诶」——设置弹层与四个下拉此前是占位发明。
本 wave 从真实 app（127.0.0.1:3086）用 computed style 逐项采集后重建，参考数据落在
`.agents/reference/proto-ref/popovers.json` 与 `settings-dialog.json`：

- 浮层菜单基座：bg #353638、r12、pad 4、border rgba(255,255,255,.06)、三层阴影；
  行 h40 / pad 8 10 / r10 / gap 8 / fs14，icon 16 muted，check 16 右侧（真实 SVG）。
- workspace 下拉：218 宽，4 工作区行（folder icon + check）+ 分隔线 footer「＋添加工作区…」。
- 模式下拉：334 宽，4 预设（真实名称与描述全文），行内 name 13/20 + desc 12/16 #81858C。
- 权限菜单：218 宽、锚点上方，Read Only / Workspace Write / Full access + 三枚真实盾牌 icon。
- 模型菜单：真实两级结构——root 双 cell 面板（模型/推理等级，341 宽，上方右对齐）→
  模型子菜单（301 宽，DeepSeek/anthropic 分组 + groupTitle 12px）与推理等级子菜单
  （240 宽，Off/Low/High/Max）；选择后回显 composer 按钮并可恢复。
- 设置弹层：800×800、r24、bg #2C2C2E，左 nav 188（cell 164×40 r12，active #434549A）
  + 内容 612；四 tab 内容按真实文案 1:1（通用设置行/副标题/右侧 h36 r18 下拉、
  外观三卡 84h r16 选中态、模型 tab 假 provider（无真实密钥信息）、插件列表、
  Agent 预设内置四卡带 slug 与「当前使用」tag）；「打开配置文件」pill h28 r14。
- .floating-menu z-index 提到 130，设置弹层内下拉不再被遮罩盖住。

验证：四浮层逐个截图与真实并排一致；模型两级菜单全链路（选 Claude Fable 5 → Max →
恢复默认）通过；设置面板 12 个可点控件 mutation 审计零死点，Esc/遮罩/×关闭正常；
attach/视图选项/添加工作区/消息更多等旧调用方回归通过；内联 JS parse PASS。

---

# （历史）v2 全量接线 handoff
- 日期 / agent：2026-08-24 / codex
- 目标：把 `design/prototype/index.html` 的全部可点控件接线到真实响应或明确 disabled，行为对齐 `plugins/deepbuddy/src/client/` 的现役 shell、Terminal、Browser 资源语义。
- 交付物：`design/prototype/index.html`（单文件、内嵌 CSS / SVG / vanilla JS、假数据、零外部依赖）。

## 已完成

### 侧栏

- 收起/展开保持原有 Pointer Capture 布局行为；折叠后交通灯与展开按钮迁到主栏左上。
- 「新建任务」切回 hero，并按 `sessionStarted` 规则同时关闭、隐藏 dock 与 dock 开关。
- 搜索按钮打开内联搜索框；输入实时过滤全部会话（含折叠的额外会话），Esc、关闭按钮与失焦都会关闭并恢复列表。
- 「视图选项」「添加工作区」使用统一定位菜单；点外关闭，菜单项统一显示右下角 2 秒 toast「原型占位」。
- 每个 workspace 组头可折叠/展开；「展开其余 N 个会话」展示额外假行并切为「收起」。
- 会话行统一用事件委托切换、高亮并保留各自消息 HTML；`Hi Hi Hi Greeting...`、`Simple Greetings`、`用 bash 运行 echo`、`AI助手自我介绍` 有不同假对话，其余按标题生成独立内容。
- 设置入口打开遮罩 + 面板，含通用、智能体、关于三组；Esc、关闭按钮、点遮罩关闭。

### 会话与 hero

- 「对话 / 轨迹」真实显隐切换；轨迹保留 4 条假步骤时间线。
- 用户和助手复制都调用 `navigator.clipboard.writeText`，失败时用 textarea 复制兜底，并立即 toast；赞/踩互斥 toggle；分叉/更多打开假菜单。
- hero 与会话 composer 的空输入发送按钮均为低透明度 disabled；有内容后启用。
- 发送会立即追加用户消息，300ms 后追加假助手回复并滚到底；异步回复绑定发起会话，切换会话期间不会串写。
- hero 发送创建或重置「新会话」侧栏行、进入会话态并高亮。
- 附件按钮打开文件/图片两项菜单并 toast；权限、模型均为可选择下拉并跨两个 composer 同步回显。
- 模型默认文案为 `DeepSeek-V4-Flash-Vision-Exp · High`；hero workspace 与模式 chip 均为真下拉。

### Dock 与资源

- Dock 按钮、关闭、最大化/退出、Ctrl/Cmd+J（仅会话态）、Pointer Capture 拖拽和双击复位保持可用；所有分段 hover/点击反馈已补齐。
- Files：目录开合、文件预览 tab、激活、关闭和滚动保持可用。
- Terminal：多 tab 新建/关闭/切换和假命令回显保持可用；输入 `exit` 进入退出态并显示与现役 `TerminalView.tsx` 一致的「重新启动终端」按钮，点击后清屏、恢复 ready prompt。
- Browser：多 tab、地址输入、每 tab 历史后退/前进、刷新、关闭/激活保持可用；`x.com`、`baidu.com` 显示拒绝嵌入态与「在系统浏览器打开」，外部打开统一 toast；刷新后页面控件会重新接线。
- 所有动态资源 tab 继续保持普通切换只切 `active/display`，不因 dock view 切换销毁资源状态。

### 零死点与视觉状态

- 所有按钮、role button、会话/文件行、更多入口均有 pointer cursor；各控件类型有 hover fill/颜色反馈；拖拽把手 hover 加亮。
- 不能操作的发送、浏览器后退/前进/刷新/外部打开均使用原生 `disabled` + 降低不透明度 + `cursor: default`。
- 统一 click pulse 给已接线控件提供即时 DOM/视觉反馈，覆盖重复点击当前 tab 等本来状态不变的真实 no-op。
- 统一 toast 移到右下角并延长为 2 秒；无 `alert()`。

## 验证证据

- DOM 主交互序列：31 项通过，覆盖搜索、菜单、工作区、设置、会话切换、复制、赞踩、消息发送/300ms 回复、hero 新会话、dock、终端 restart、浏览器历史与拒绝态；输出 `DOM interaction sequence: PASS`。
- DOM 次级控件普查：20 项通过，覆盖添加工作区、点外关闭、附件、权限/模型/hero 模式、dock 最大化、Files/Terminal/Browser tab、Ctrl+J、遮罩关闭；输出 `Secondary control sweep: PASS`。
- 异步归属回归：发送后立即切换会话，300ms 回复仍留在发起会话；输出 `PASS delayed reply stays with originating session`。
- 静态门禁：内联 JS `new Function` 解析通过；tokens 原名原值 `398/398`；单文件 `110396 bytes`；无外部 CSS/JS 依赖；CSS 自定义属性仅保留原有带 fallback 的 `--dsw-alias-bg-raised`；`git diff --check` 通过。
- 范围核对：`plugins/`、`apps/` 无本任务改动；未 commit。

## 未完成 & 下一步

- 应用内 Browser 运行时发现仍为 `[]`，因此本 session 无法实际打开 `file://.../prototype/index.html` 做渲染截图、真实 hover/cursor 和 250ms MutationObserver 浏览器普查；不能把 DOM 运行时验收表述为截图级 E2E。
- Browser 恢复后打开 `file:///Users/byron/Desktop/Projects/Devs/deepbuddy/design/prototype/index.html`，按 hero → 会话 → 侧栏折叠 → dock Files/Terminal/Browser 六个状态逐控件点击，并与 `.agents/reference/proto-ref/` 7 张截图并排目测。

## 关键决策与约束

- 用户纠偏已落到 `.agents/corrections/2026-08-24-prototype-dead-controls.md`：呈现控件不等于交互完成，交付前必须逐状态枚举控件，真实响应或 disabled，零静默死点。
- 真实语义以 `plugins/deepbuddy/src/client/shell/layout-store.ts`、`features/terminal/TerminalView.tsx`、`features/browser/BrowserView.tsx` 为准；原型只在单文件里用假数据模拟，不复制或修改业务源码。

## 复测入口

```bash
node -e 'const fs=require("fs");const h=fs.readFileSync("design/prototype/index.html","utf8");new Function(h.slice(h.indexOf("<script>")+8,h.lastIndexOf("</script>")));console.log("inline JS parse: PASS")'
git diff --check -- design/prototype/index.html .agents/corrections/2026-08-24-prototype-dead-controls.md .agents/handoffs/2026-08-24-html-prototype.md
git status --short -- plugins apps design/prototype/index.html .agents/corrections/2026-08-24-prototype-dead-controls.md .agents/handoffs/2026-08-24-html-prototype.md
```
