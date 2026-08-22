# 任务：基础能力对齐（阶段 2）——四种模式 + 插件入口进 DeepBuddy 自绘 UI

前提：阶段 1（迁移+骨架）已完成且验收通过。

## 前置任务 0：修复 workspace-shell 在 dsh rc.6 下的 session-not-found（已确诊，先做这个）

现象与确诊（fable 已完成根因定位，不要重复诊断）：
- 3081（rc.6）上 `workspaceShell/listDirectory` 对任何会话返回 `{error:{kind:'session-not-found'}}`，
  同一 sessionId 的官方 `session.history` 正常；3080（rc.5 老进程）上同一调用成功。
- 根因：rc.6 把 agent plane 挪进 preset realm 后，host 插件行的 `ctx.sessions.get(sessionId)`
  只见本 realm 的 live 会话，看不到网关托管的会话；网关自己对冷会话走
  `ctx.get('sessionPersistence')`（`(await persistence.list()).find(h => h.id === sessionId)`
  拿 header 的 `cwd`，见 rc.6 `dsh-host-apiproxy/lib/index.js` ensureSession）。
- `sessionPersistence` 服务 rc.5 就存在（core/agent 引用），回退两端兼容。

修改（唯一允许动老仓库的点）：`/Users/byron/Desktop/Projects/Devs/dsh-plugins/plugins/workspace-shell/src/host.js`
两处 session 解析（`resolveWorkspaceFile` ~106 行、另一处 ~219 行）改为：
先 `ctx.sessions.get(sessionId)?.header?.cwd`，undefined 时回退
`ctx.get('sessionPersistence')` → `list()` → `find(h => h.id === sessionId)?.cwd`；
两路都拿不到才返回 `session-not-found`（`session-no-cwd` 语义保留）。
注意该文件是无构建 host 插件（直接发 .js），改完跑 workspace-shell 自己的测试。
然后**重启 3081 服务**（旧 pid 见 /tmp/deepbuddy-web-3081.log 的启动命令；
`DSH=/Users/byron/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh; "$DSH" --profile deepbuddy --port 3081`），
在浏览器打开 http://127.0.0.1:3081 选一条历史会话，确认右侧文件树列出真实目录。
把该修复也写进 dsh-plugins 的 `.agents/handoffs/`（一句话 + 根因 + 验证）。本阶段在
`~/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy` 内实现两块能力，
**全部用 DeepBuddy 自己的组件与视觉语言**（v2 设计：系统字体 600、暖灰、圆角、hairline），
官方 `ui-agent-preset` / `ui-settings-plugin-inventory` 源码只作服务用法参考，不复用其组件。

## 官方契约（已核实，来源 deepseek-harness 源码）

RPC（`ConnectionHandle.api`，typed remotes；deepbuddy 需加 devDep `@deepseek-ai/dsh-api-remotes@0.1.0-rc.6`，
以安装包 .d.ts 为准核对签名，源码 checkout 是 rc.5 可能有漂移）：

- `api.agentPresets.list({})` → 花名册（四种内置：standard 标准 / code PTC / minimal 极简 / cordis 创造；
  含 trust: system|user、broken 标记）
- `api.agentPresets.select({ sessionId, agentPreset })` → 给**空白会话**选模式；运行中会话会被
  gateway 以 `agent-preset-locked` 拒绝——UI 必须只在 `summary.blank === true` 时提供切换
- `api.agentPresets.read / copy({from, agentPreset, name}) / remove({agentPreset}) / openDocument`
  → 花名册管理（copy-only 创作、删除仅限 user trust）
- 默认模式是 settings 字段（namespace `settings.agentPreset`，参考官方 settings-store.ts 的
  `writeDefaultPreset`；`api.settings.describe({})` 可读）
- `ctx.remote.pluginInventory.list()` → 当前 Loader 条目清单（只读）

事件与客户端折叠：

- `ctx.remote.$on('agent-preset/selected', (sessionId, agentPreset) => sessions.noteAgentPreset(sessionId, agentPreset))`
  ——所有标签页收敛已提交的选择
- `ctx.remote.$on('settings/document-updated', ns)`（ns === 'settings.agentPreset' 时刷新默认值）
- `SessionSummary.agentPreset` 字段显示会话当前模式
- 创造模式入口语义（官方 creatorDraft）：暂存 cordis 模式 + `workspaces.startSession()`，
  新空白会话落地时对它 `select`

## 要做的 UI（DeepBuddy 设计语言）

1. **模式 chip（空会话 hero）**：EmptyHero 场景段旁加当前模式 chip，点击出 DeepBuddy 风格
   drop-up（白底 r12 shadow-lg，列出四种模式+描述，当前项 neutral-200）；选择即对当前空白会话
   `select`；非空白会话只读显示。
2. **会话头模式标签**：Conversation 标题栏显示 `summary.agentPreset` 对应名称（只读，无会话或
   无字段时不渲染）。
3. **SettingsDialog 接真——模式管理页**：列出花名册（名称/描述/trust/当前默认），操作：
   设为默认（写 settings 字段）、复制（输入新 id/名称）、删除（user trust 才显示，需确认）、
   「新建模式」= 创造模式入口（cordis 暂存 + startSession，关闭设置弹窗）。
4. **SettingsDialog 接真——插件页**：`pluginInventory.list()` 清单（id/名称/状态），只读 v1；
   顶部说明文案：插件的创作/变更/删除通过创造模式会话进行（对齐官方产品语义）。
5. mock.ts 中相应演示数据（SCENES 权限占位不动）删除已被真实数据替代的部分。

## 硬约束

- 沿用现有代码风格（class 组件 + 订阅模式、dsh.ts 类型派生法、`.dbdy` 样式）。
- 类型从 `ClientContext` / 安装包 .d.ts 派生，不点名内部导出；断言"API 不存在"前先查 .d.ts。
- 失败态照 promptError 模式透出（refusal/error 红字，不吞）。
- 测试：现有 tests 全绿 + 新增最小契约测试（如 preset 排序/blank 判定纯函数）。
- build/test/typecheck 全绿后，用 3081 服务真机验证：新建会话→切到极简模式→发消息，
  会话头显示模式；设置里复制一个 preset 再删除。汇报带实际输出与截图路径。
- 汇报写 `.agents/handoffs/2026-08-17-phase2-alignment.md`。
