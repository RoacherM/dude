# 任务：官方同步流程与开发规范（阶段 3）

前提：阶段 1/2 已验收。本阶段不写 UI，交付**同步官方最新改动**的自动化与规范。

产品定位准绳（写进所有文档的开头，决策以此为准）：
**「兼容官方的所有功能 + 精选 UI + 精选插件——DeepSeek Harness 最好的发行版」**。
官方包永远零修改；升级 = bump 版本 + 契约测试 + 冒烟；兼容问题一律在自有插件层修
（先例：rc.5→rc.6 sessions realm 漂移，修在 workspace-shell host 的
sessionPersistence 回退，见 dsh-plugins 的 2026-08-17 handoff）。

## 交付物（三件）

### 1. `scripts/sync-upstream.mjs`（Node 内置模块，零新依赖）

子命令（用 `--check` / `--apply` / `--smoke` 旗标）：

- `--check`：查 npm registry（`npm view @deepseek-ai/dsh-client-runtime versions --json`
  为版本锚，另查 `dsh` CLI dist-tags）与 repo 锁定版本
  （`plugins/deepbuddy/package.json` 里任一 `@deepseek-ai/*` devDep）比对。
  无新版 → 打印「已最新」exit 0；有新版 → 打印版本差 exit 1。
- `--apply`：已最新则短路。否则：bump `plugins/*/package.json` 全部
  `@deepseek-ai/*` devDeps → `pnpm install` → 两个构建门禁
  （`pnpm --filter dsh-plugin-deepbuddy build/test/typecheck`，外加
  `cd /Users/byron/Desktop/Projects/Devs/dsh-plugins/plugins/workspace-shell && pnpm test`
  ——它是 profile 的 link 成员）→ 通过后自动跑 `--smoke`。
  任一步失败：`git -C <repo> checkout -- .` 回滚 bump，报告失败层级后 exit 1。
- `--smoke`：起临时服务 `"$DSH" --profile deepbuddy --port 3082`（等待 HTTP 200，
  最多 30s），然后逐项：
  1. `/` 200 且 `/plugins/dsh-plugin-deepbuddy/client.js` 200 + ModuleLoader 头；
  2. `agentPreset.list` RPC（wire 封套：`{"type":"client-request","rpcId":"<uuid>","method":…,"payload":{}}`
     POST 到 `/api/<method>`）→ `ok:true` 且 presets ≥ 4 且四个内置 id 都在；
  3. `session.list` → 取第一个有 cwd 的 sessionId → `workspaceShell/listDirectory`
     → `ok:true` 且无 `error.kind`（这是 rc.6 漂移的回归卡）；无会话则记 SKIP；
  4. boot 清单（首页 HTML 或 `/plugins/…` 探测）包含 deepbuddy 与 workspace-shell entry。
  结束 kill 服务。每项 PASS/FAIL/SKIP 打印。
- 报告：所有模式把结果追加写 `reports/upstream-sync/<ISO日期>.md`
  （版本对、各门禁输出摘要、冒烟逐项、结论），路径打印到 stdout。
- dsh CLI 本体升级不自动做（npx 缓存路径因人而异），在报告与 UPGRADE.md 里
  给命令：`npm exec -y dsh@latest -- --version`。

### 2. `UPGRADE.md`（repo 根，中文）

- 定位准绳段（上面那句）。
- 「日常同步」：`node scripts/sync-upstream.mjs --check` → 有新版走 `--apply` →
  绿了之后**人工视觉验收清单**（打开 3081：三栏骨架、历史会话消息流、文件树、
  模式 chip 切换、设置两页、发一条消息端到端），全过才 commit bump。
- 「契约测试守什么」：列出两仓测试各自锁的官方契约
  （root shadow 注册面、sessions/workspaces 快照面、agentPresets RPC 面与纯函数、
  workspaceShell 端点 + sessionPersistence 回退用例即 rc.6 案例、client bundle purity）。
  升级踩到新漂移时的规矩：先在测试里固化案例，再在自有插件层修，最后记 handoff。
- 「回滚」：git 恢复 + profile 里 `dsh plugin remove/add` 重装旧版本的说明。
- 「精选插件的准入」：新插件进 profile 的标准（有测试、可独立安装、
  不 gate root shadow、失败即值）。

### 3. `.github/workflows/upstream-sync.yml`

- `schedule`（每周一 09:00 UTC+8）+ `workflow_dispatch`。
- job：checkout → pnpm setup → `node scripts/sync-upstream.mjs --check`；
  有新版时跑 `--apply`（含 smoke），绿则用 `peter-evans/create-pull-request`
  开 bump PR（body 贴报告），红则开 issue 贴失败报告。
- repo 尚无远端：yml 写好即可，顶部注释说明推远端后生效；不要为此改动其他文件。

## 硬约束

- 不改官方包与 deepseek-harness 仓；不 git commit。
- 脚本写完必须实测：跑一遍 `--check`（当前应为「已最新」）、一遍 `--apply`
  （应短路）、一遍 `--smoke`（3082 起服务，四项全 PASS 或有理有据的 SKIP，
  注意别动 3081 正跑的服务）。把实际输出贴进汇报。
- 报告目录 `reports/` 加进 `.gitignore`？——不加，报告应入库沉淀；在 UPGRADE.md 说明。
- README.md 定位段核对：把定位准绳那句放进「定位」开头（若已有类似表述则精修为准绳原句）。

## 汇报

结论先行 + 每个交付物路径 + 实测输出摘要，写
`.agents/handoffs/2026-08-17-phase3-upstream-sync.md`。
