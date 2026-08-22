# DeepBuddy 阶段 2：四种模式 + 插件入口进自绘 UI handoff

- 日期 / agent：2026-08-17 / claude
- 目标：前置任务 0（workspace-shell rc.6 session-not-found 修复）+ 阶段 2 主体
  （模式 chip / 会话头模式标签 / SettingsDialog 模式管理页 + 插件页）。

## 结论

前置任务 0 与阶段 2 五项全部完成。两个包 build/test/typecheck 全绿
（deepbuddy 10/10，workspace-shell 28/28），3081 真机走完 brief 指定的两条验收路径。
**与 brief 有三处偏差，均在下面「与 brief 的偏差」列明。**

---

## 前置任务 0：workspace-shell rc.6 session 解析

改 `~/Desktop/Projects/Devs/dsh-plugins/plugins/workspace-shell/src/host.js`（唯一动老仓库的点）。

新增 `resolveSessionCwd(ctx, sessionId, signal)`：live `ctx.sessions.get()?.header?.cwd`
→ 回退 `ctx.get('sessionPersistence').list(signal).find(h => h.id === sessionId)?.cwd`；
两路都拿不到才 `session-not-found`，已知会话但无 cwd 仍是 `session-no-cwd`。
`resolveWorkspaceFile`（~106 行）与 `resolveWorkspaceDirectory`（~219 行）各自去掉
重复的 5 行解析改为调用它。`sessionPersistence` 不进 `inject`——和 `fs` 同理，
缺席是每请求回退，不是让整个抽屉不挂载的理由。

契约核实（安装包 .d.ts，不是 rc.5 源码 checkout）：
`dsh-session-persistence/lib/types/index.d.ts:176` `abstract list(signal?): Promise<SessionHeader[]>`；
`dsh-session/lib/types/types.d.ts:52` `readonly cwd?: string`。

测试：新增 `describe('session root resolution')` 5 条，ctx 形状是「live 表为空 +
persistence 存根」——正是 rc.6 下 host 插件行看到的形状。

```sh
cd ~/Desktop/Projects/Devs/dsh-plugins/plugins/workspace-shell && pnpm test && pnpm typecheck
# tests 28 / pass 28 / fail 0（原 23 + 新 5）；tsc --noEmit 无输出
```

真机（重启 3081 后）：
- 历史会话「介绍AI助手功能」右侧文件树列出 `/Users/byron/Desktop/Projects/Devs/deepseek-harness`
  的真实条目（.agents/.artifacts/.claude/.git/… AGENTS.md/BENCHMARK.md/CLAUDE.md）。
  截图 `assets/2026-08-17-task0-filetree-restored.png`。
- **冷会话** `Docs`（1 天前、未开始）列出 `/Users/byron/Desktop/Docs`
  的真实条目（1-金融投资…5-票据、.DS_Store、文档索引.md）。
  截图 `assets/2026-08-17-task0-cold-session-tree.png`。

dsh-plugins 侧 handoff：`~/Desktop/Projects/Devs/dsh-plugins/.agents/handoffs/2026-08-17-workspace-shell-rc6-session-resolution.md`。

---

## 官方契约核实（全部对着安装包 .d.ts / 已装 rc.6 lib，不是源码 checkout）

| 事实 | 出处 |
|---|---|
| `connection.api` 是 `IApiClient`，带 `agentPresets` / `settings` | `dsh-host-apiproxy/lib/types/fetch/client.d.ts:68,88` |
| `agentPresets.list/select/read/copy/openDocument/remove` 签名 | `dsh-host-apiproxy/lib/types/api/agent-presets.d.ts:43-129` |
| `AgentPresetEntry` 带 **`isDefault`**、`trust`、`name?`、`description?`、`broken?` | 同上 :14-41 |
| 默认模式的 settings **namespace 是 `agent-presets`，字段 `default`** | `dsh-agent-presets/lib/index.js:794-796`（`settingsNamespace('agent-presets')`，`z.object({default: z.string()})`）；官方 UI 侧 `dsh-client-ui-agent-preset/lib/client.js:490` `AGENT_PRESET_SETTINGS_NS = "agent-presets"` |
| 写默认走 `settings.update({ns, patch:{default:id}})` | 同上 :511-527 `writeDefaultPreset` |
| `SessionSummary.agentPreset` / `sessions.noteAgentPreset` 存在 | `dsh-client-runtime/lib/types/client/sessions/service.d.ts:42,235` |
| `ctx.remote.pluginInventory.list()` 只在 typed Remote 上（apiproxy 无此路由） | `dsh-host-plugin-inventory/lib/typert.remote-client.d.ts`；`rpc-map.d.ts` grep `pluginInventory` 命中 0 |
| `ctx.remote` 由 api-remotes/client 声明；`$on` 存在 | `dsh-api-remotes/lib/types/client/index.d.ts:27-32`、`dsh-typert-protocol/lib/types/types.d.ts:202` |
| creatorDraft 语义 = `stage('cordis')` + `workspaces.startSession()` | `dsh-client-ui-agent-preset/lib/client.js:1640-1642` |

真实 roster（`curl -X POST :3081/api/agentPreset.list`）：4 条 system preset
（standard 标准模式 isDefault / code PTC 模式 / minimal 极简模式 / cordis 创造模式），
`authorable: true`、`hasDocument: true`。

---

## 阶段 2 改动

依赖：`plugins/deepbuddy/package.json` devDeps 加 `@deepseek-ai/dsh-api-remotes: 0.1.0-rc.6`
（只为 `ctx.remote` 与 `pluginInventory` 的类型增补；`import type {}` 在 build 里被抹掉，
bundle purity 规则不触发）。

### 新文件 `src/client/presets.ts`（无运行时 import，只有 `import type`）

- 类型全部从 `ConnectionHandle['api']` / `ClientContext['remote']` 派生，
  不点名内部导出：`AgentPresetRoster`、`AgentPresetEntry`、`PresetSessionId`
  （取自 `select` 自己的 payload）、`PluginInventory`、`PluginEntry`。
- `createPresetsWire(api)`：`list / select / copy / remove / setDefault`。
  两种失败（transport reject、`ok:false` 信封）折成同一个
  `{ok:false, error:string}`——DeepBuddy 每个面都用 promptError 红字模式渲染，
  且 click handler 里抛出的错误会丢。
- `createPluginsWire(remote)`：`list()`。
- 纯函数（测试直接跑）：`presetLabel`、`selectablePresets`（滤掉 broken）、
  `defaultPresetId`、`canSelectPreset`（blank 判定）、`canRemovePreset`（user trust）、
  `copyIdBlocker`、`canAuthorPresets`、`pluginPhaseLabel`。

### `src/client/index.tsx`

`Dsh` 加 `presets` / `plugins` / `onRosterMoved`。Remote 面**走子作用域，不进插件自己的
`inject`**：

```
ctx.inject(['remote'], scope => scope.effect(() => {
  scope.remote.$on('agent-preset/selected', (sid, p) => ctx.sessions.noteAgentPreset(sid, p))
  scope.remote.$on('settings/document-updated', ns => { if (ns === 'agent-presets') …刷新 roster })
}))
ctx.inject(['remote','remote.pluginInventory'], scope => scope.effect(() => { dsh.plugins = … }))
```

理由：DeepBuddy 是发行版唯一 UI，把 root slot 注册 gate 在可选服务上，
一旦 api-remotes 缺席就整个没界面。测试里有断言锁住这一点。

### `src/client/AppFrame.tsx`

state 加 `roster / presetError / presetBusy / presetOpen / stagedPreset / settingsTab /
copy / pendingDelete / plugins / pluginsError`；动作 `loadRoster / selectPreset /
applyStagedPreset / makeDefaultPreset / beginCopyPreset / patchCopy / cancelCopyPreset /
confirmCopyPreset / confirmDeletePreset / removePreset / startCreatorSession /
loadPlugins / openSettings / setSettingsTab`。

暂存-落地机制照官方 seat 语义：空会话屏没有会话可切，pick 先暂存，
`onSessions` 每次列表变化后调 `applyStagedPreset()`——会话可能先于或后于 pick 出现；
非 blank 会话直接吃掉暂存不发请求（gateway 会答 `agent-preset-locked`）。

### `src/client/Conversation.tsx`

- `ModeChip`：hero 场景段右侧。blank（或无会话）时可点，出 DeepBuddy 风格菜单
  （白底 r12 shadow-lg、四种模式+描述、当前项 neutral-200）；非 blank 渲染成同样式的静态 chip。
- 会话头：`summary.agentPreset` 对应名称的只读 pill（无会话/无字段/roster 未到 → 不渲染）。
- `presetError` 在 hero 下方红字透出。

### `src/client/SettingsDialog.tsx`（重写）

顶部「模式 / 插件」两页 rail，620px、`maxHeight 82vh`、内容区滚动。
- 模式页：roster 全量（含 broken 行）+ 默认/内置/本地/不可用标记 + 描述 + mono id；
  操作「设为默认」（非默认且非 broken）、「复制」（`authorable` 时）、
  「删除」（user trust，行内二次确认）；底部「新建模式」= 暂存 cordis +
  `startSession()` + 关弹窗。
- 插件页：`pluginInventory.list()`，模块名 + 已挂载/已停用/挂载失败…，顶部说明
  「插件的创作、变更与删除通过创造模式会话进行」。

### 其他

- `src/client/Sidebar.tsx`：齿轮改调 `frame.openSettings('presets')`（进弹窗即拉 roster）。
- `src/client/dsh.ts`：`Dsh` 接口扩展 + 注释。
- Escape 关闭列表加 `presetOpen`。

---

## 验证

### 构建 / 测试 / 类型

```sh
pnpm --filter dsh-plugin-deepbuddy build     # lib/index.js 88b; lib/client.js 153.2kb
pnpm --filter dsh-plugin-deepbuddy test      # tests 10 / pass 10 / fail 0（原 5 + 新 5）
pnpm --filter dsh-plugin-deepbuddy typecheck # tsc --noEmit 无输出
```

新增 5 条：
1. `client bundle reaches the preset plane without gating the root shadow`——
   断言 bundle 里 `inject = ["slots","connection","sessions","workspaces"]` 未变、
   `inject(["remote"])` 与 `inject(["remote","remote.pluginInventory"])` 走子作用域、
   两个 `$on` 都在。
2. `presets: the roster folds to what each surface may offer`——broken 行不进 picker、
   顺序保持 root precedence（不排序）、`defaultPresetId` 三种情形、label 回退、
   `canRemovePreset` 逐行、`canAuthorPresets`。
3. `presets: switching is offered exactly where the gateway allows it`——blank 判定三态。
4. `presets: the copy id is fenced before it reaches the host`——空/纯空格/大写空格/
   前导连字符/`../escape`/重名全部被拦，`  my-mode  ` 通过。
5. `presets: every inventory phase has a label`——6 个 phase + disabled 分支。

### 3081 真机（rc.6，pid 90928，日志 `/tmp/deepbuddy-web-3081.log`）

**路径 A：新建会话 → 切极简模式 → 发消息**
- blank 会话 `Docs` 的 hero chip 初始显示「PTC 模式」（该会话 header 的
  `agentPreset` 是 `code`），会话头同步显示同名 pill
  → `assets/2026-08-17-phase2-hero-chip.png`
- 点 chip 出菜单，四种模式与真实描述、当前项 PTC 高亮
  → `assets/2026-08-17-phase2-mode-menu.png`
- 选「极简模式」：chip 与会话头同时变为「极简模式」（`select` 落地后
  `noteAgentPreset` 折叠）
- 发 `回复两个字：收到`，模型回复「收到」，标题栏变
  `收到 · 3 条消息 · DOCS` + 「极简模式」pill
  → `assets/2026-08-17-phase2-header-mode.png`

**路径 B：设置里复制一个 preset 再删除**
- 模式页列出 4 条真实 roster，standard 带「默认」标
  → `assets/2026-08-17-phase2-settings-presets.png`
- minimal 行「复制」→ 表单「复制自 MINIMAL」，填 `phase2-probe` / 「阶段二验证模式」
  → `assets/2026-08-17-phase2-copy-form.png`
- 提交后新行出现，trust 标「本地」并带「删除」，描述继承自 minimal（官方 copy 语义：
  保留 description、不保留 name）→ `assets/2026-08-17-phase2-copied.png`
- 磁盘核对：`ls ~/.dsh/.agent-presets/phase2-probe/` → `agent.cordis.yml` 2.3K、`preset.yml` 113B
- 「删除」→ 行内确认条 → `assets/2026-08-17-phase2-delete-confirm.png`
- 「确认删除」后 roster 回到 4 条 → `assets/2026-08-17-phase2-deleted.png`；
  `find ~/.dsh/.agent-presets -mindepth 1` 无输出（目录已清空）

**插件页**：141 条真实 Loader 条目，`cordis:include`、`@deepseek-ai/*` 全「已挂载」，
`cordis-plugin-hmr` 有一行「已停用 / 已禁用」，尾部含 `dsh-plugin-deepbuddy` 与
`dsh-plugin-workspace-shell` → `assets/2026-08-17-phase2-settings-plugins.png`、
`assets/2026-08-17-phase2-plugins-tail.png`

---

## 与 brief 的偏差

1. **settings namespace 不是 `settings.agentPreset`，是 `agent-presets`。**
   brief 写「namespace `settings.agentPreset`」——`settings.agentPreset` 实际是官方
   ui-agent-preset 的 **locale 字典 key**（`ctx.locale.register('settings.agentPreset', …)`）。
   真正的 settings namespace 由 `dsh-agent-presets/lib/index.js:794`
   `SETTINGS_NAMESPACE = 'agent-presets'` 决定，字段 `default`。按实际值实现。

2. **hero 模式菜单向下展开，不是 drop-up。**
   brief 写「点击出 DeepBuddy 风格 drop-up」。chip 位于滚动体顶部约 114px 处，
   四行带描述的菜单高约 280px，向上开会整段出画。视觉规格（白底 r12 shadow-lg、
   当前项 neutral-200）完全照 brief，只是方向朝下——`DROPUP` 与新增的 `DROPDOWN`
   共用同一个 `MENU` 基样式，composer 的两个 picker 仍然向上。

3. **mock.ts 没有可删的部分。**
   brief 要求「删除已被真实数据替代的部分」。核对后：本阶段替换掉的是
   SettingsDialog 里**写死在组件内**的三行（默认模型 / 工具权限 / 工作区目录），
   它们本来就不在 mock.ts。mock.ts 的每个导出仍被本阶段未触及的面消费——
   `SCENES`/`SCENE_NAMES`/`PERMS` 由 Conversation 用（brief 明示不动），
   `SITES`/`STEPS`/`HISTORY`/`GIT_CHANGES`/`RUN_STATS`/`ARTIFACTS`/`SKILLS`
   由 WorkspacePanel 的演示浏览器/概览/Git 三视图用。**未删任何东西**，
   按外科手术式修改原则不动无关演示数据。

---

## 改动文件清单

```
M  plugins/deepbuddy/package.json              (+@deepseek-ai/dsh-api-remotes devDep)
A  plugins/deepbuddy/src/client/presets.ts     (新)
M  plugins/deepbuddy/src/client/dsh.ts         (Dsh 加 presets/plugins/onRosterMoved)
M  plugins/deepbuddy/src/client/index.tsx      (两个 remote 子作用域 + 两个 wire)
M  plugins/deepbuddy/src/client/AppFrame.tsx   (10 个 state 字段 + 14 个动作)
M  plugins/deepbuddy/src/client/Conversation.tsx (ModeChip + 会话头 pill + DROPDOWN)
M  plugins/deepbuddy/src/client/SettingsDialog.tsx (重写：两页 rail + 真实数据)
M  plugins/deepbuddy/src/client/Sidebar.tsx    (齿轮改 openSettings)
M  plugins/deepbuddy/tests/plugin.test.mjs     (+5 条)
A  .agents/handoffs/2026-08-17-phase2-alignment.md
A  .agents/handoffs/assets/2026-08-17-task0-*.png            (2)
A  .agents/handoffs/assets/2026-08-17-phase2-*.png           (9)
M  pnpm-lock.yaml
```

仓库外：`~/Desktop/Projects/Devs/dsh-plugins/plugins/workspace-shell/src/host.js`（前置任务 0）、
同仓 `tests/host.test.mjs`、`.agents/handoffs/2026-08-17-workspace-shell-rc6-session-resolution.md`。
`~/Desktop/Projects/Devs/deepseek-harness` 未改动。两边均未 commit。

## 未完成 & 下一步

- **Electron 壳未在本阶段重跑**（阶段 1 验过；本阶段只改 client bundle，
  壳只是同一 URL 的容器）。
- **`agentPresets.read` / `openDocument` 未接**：brief 的第 3 项只要求
  「设为默认 / 复制 / 删除 / 新建模式」四个操作。查看 preset 组合原文、
  以及复制后「打开 preset 目录」（官方 confirmCopy 之后会 openLocation）
  尚未做，下一版可加。
- **仍是占位的**：工具权限三档（`PERMS`）、模型选择（Auto 按钮）、
  审批/提问 `interaction`、Trajectory，以及 WorkspacePanel 的浏览器/概览/Git 三视图。
- 「新建模式」入口已接通（暂存 cordis + startSession），但**未走完一次真实的
  创造模式会话**（那要模型实际写出一个 preset 目录）。

## 关键决策与约束

- **root shadow 永不被可选服务 gate**：Remote 面（`remote`、`remote.pluginInventory`）
  一律走 `ctx.inject(...)` 子作用域，插件自己的 `inject` 保持四项不变。测试锁住。
- **失败即值，不抛**：presets.ts 把 transport reject 与 `ok:false` 折成同一形状，
  UI 用既有 promptError 红字模式渲染。
- **只在 blank 会话提供切换**：`canSelectPreset` 是纯函数且被测试覆盖，
  chip 对非 blank 会话渲染为静态文本——不做「点了必失败」的控件。
- **preset 创作是 copy-only + 创造模式会话**，不在设置里做表单；插件页 v1 只读。
  这是官方产品语义，DeepBuddy 沿用。
- 默认模式写 settings 字段（`agent-presets` / `default`），不碰 preset 本体；
  运行中会话保持开始时的组合。

## 复测入口

```sh
cd ~/Desktop/Projects/Devs/deepbuddy && pnpm install
pnpm --filter dsh-plugin-deepbuddy build && pnpm --filter dsh-plugin-deepbuddy test && pnpm --filter dsh-plugin-deepbuddy typecheck
cd ~/Desktop/Projects/Devs/dsh-plugins/plugins/workspace-shell && pnpm test && pnpm typecheck

DSH=/Users/byron/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh
"$DSH" --profile deepbuddy --port 3081     # 已在跑：pid 90928
# 浏览器 http://127.0.0.1:3081：
#   1) 选一条历史会话 → 右侧文件树列出真实目录（前置任务 0）
#   2) 空白会话 hero 的模式 chip → 换模式 → 发消息 → 会话头显示模式
#   3) 侧栏齿轮 → 模式页复制/删除；插件页看 Loader 清单
curl -s -X POST http://127.0.0.1:3081/api/agentPreset.list -H 'content-type: application/json' \
  -d '{"type":"client-request","rpcId":"probe","method":"agentPreset.list","payload":{}}'
```
