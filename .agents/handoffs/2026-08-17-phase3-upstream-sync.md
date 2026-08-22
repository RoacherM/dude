# DeepBuddy 阶段 3：官方同步流程与开发规范 handoff

- 日期 / agent：2026-08-17 / claude
- 目标：交付「同步官方最新改动」的自动化与规范（脚本 / UPGRADE.md / CI），不写 UI。

## 结论

三个交付物全部完成并实测。`--check`／`--apply` 短路／`--smoke` 四项全 PASS，
另外把 brief 没要求但风险最高的两条路径（**真实 bump** 与 **失败回滚**）
也用受控降级实测通过，仓库最终状态与动手前**逐字节一致**。

实测中发现并修掉一个真实缺陷：冒烟原本会在端口被占时验到**别人的服务**上
（3081 的开发服务给自己打分）。已改成端口占用即 fail-fast。

**与 brief 有一处偏差**（回滚不用 `git checkout -- .`），见下面「与 brief 的偏差」。

---

## 交付物

### 1. `scripts/sync-upstream.mjs`（Node 内置模块，零新依赖，666 行）

三个旗标，各自都写报告：

| 旗标 | 行为 | exit |
|---|---|---|
| `--check` | `npm view @deepseek-ai/dsh-client-runtime versions --json` 取最新（semver 比较含 prerelease 语义），对比 `plugins/deepbuddy/package.json` 的固定 `@deepseek-ai/*` devDep；另报 `@deepseek-ai/dsh` 的 dist-tags | 已最新 0 / 有新版 1 |
| `--apply` | 已最新则短路不改文件；否则 bump → `pnpm install` → deepbuddy `build`/`test`/`typecheck` → workspace-shell `pnpm test` → `--smoke` | 全绿 0 / 任一步失败回滚后 1 |
| `--smoke` | 3082 起临时 `dsh --profile deepbuddy`，等 200（≤30s），四项逐检，结束 kill 进程组 | 无 FAIL 则 0 |

实现上的几个决定：

- **版本锚**：只认「精确固定」的 `@deepseek-ai/*`（`0.1.0-rc.6`），
  排除 `@deepseek-ai/cordis: ^4.0.1`——它是另一条版本线。
  bump 时**按旧版本字符串精确匹配**再替换，而不是按包名前缀匹配，
  这样将来有人把 cordis 也钉成精确版也不会被误伤。
- **门禁失败即停并回滚**，报告里写明失败层级（依赖安装／某个 script／
  workspace-shell 契约／冒烟）。
- **workspace-shell 目录缺席不算失败**，记 SKIP 并在 stdout 与报告里都打警告
  （CI runner 上没有兄弟仓时不能静默变绿）。可用 `WORKSPACE_SHELL_DIR` 覆盖路径。
- **`dsh` 定位**：`DSH` 环境变量 → `command -v dsh` → 扫 `~/.npm/_npx/*/node_modules/.bin/dsh`；
  都没有就 fail-fast。CLI 本体不自动升级，报告里给命令 `npm exec -y dsh@latest -- --version`。
- 报告追加写 `reports/upstream-sync/<ISO日期>.md`，路径打到 stdout。

四项冒烟的实际判据（wire 形状全部对着 3081 实测确认，不是照文档猜）：

1. `/` 200 且 `/plugins/dsh-plugin-deepbuddy/client.js` 200 + `window.__ModuleLoader__.load({ id: "dsh-plugin-deepbuddy"` 头。
2. `agentPreset.list` → `ok:true`、presets ≥ 4、`standard/code/minimal/cordis` 齐。
3. `session.list` → 第一个有 `cwd` 的 sessionId → `workspaceShell/listDirectory` →
   `ok:true` 且 `result.value.error` 不存在。**无有 cwd 的会话则 SKIP。**
4. 首页 `__DSH_BOOT__` 的 entries 含 `dsh-plugin-deepbuddy` 与 `dsh-plugin-workspace-shell`。

⚠️ **两处 wire 细节和直觉不一样，写脚本前实测过**：

- `workspaceShell/*` 是 typert Remote 路由，payload 必须是
  `{"args":{"request":{sessionId,path}}}`。直接传 `{sessionId,path}` 会被网关拒：
  `Remote payload must contain exactly one plain-object args field`。
- 首页的 `window.__DSH_BOOT__ = {...}` **没有结尾分号**，正则要收在 `</script>` 上。

### 2. `UPGRADE.md`（repo 根，中文）

段落：定位准绳（含三条推论）／日常同步（含 `--apply` 固定顺序、四项冒烟表、
**六项人工视觉验收清单**、dsh CLI 手动升级、报告与「为什么 `reports/` 不进 gitignore」）／
契约测试守什么（两仓逐面列表 + 踩到新漂移的三步规矩）／回滚（四步）／
精选插件的准入（四条）。

契约面清单是照两仓测试逐条核出来的，不是概述：
deepbuddy 10 条覆盖 root shadow 注册面、四项 inject 列表、agentPresets 纯函数、
Remote 面不 gate root shadow、client bundle purity、host half、几何；
workspace-shell 28 条覆盖 readFile 围栏 / 预览截断 / listDirectory /
**sessionPersistence 回退（rc.6 案例，5 条）** / typert 注册面。

准入第 3 条给了硬判据：**把该插件从 profile 摘掉，界面必须照样出来**——
现有测试锁着 `inject = ["slots","connection","sessions","workspaces"]`，
往里加东西会直接红。

### 3. `.github/workflows/upstream-sync.yml`

`schedule: '0 1 * * 1'`（= 每周一 09:00 UTC+8，cron 只认 UTC）+ `workflow_dispatch`。
11 个 step：检出两仓 → pnpm 10.18.3 / node 24 → `pnpm install --frozen-lockfile` →
装 dsh CLI 并组装 profile → `--check`（exit 1 折成 `behind=true` 输出量，
不让它算作 job 失败）→ `--apply`（`continue-on-error`）→ 收报告 →
绿走 `peter-evans/create-pull-request@v6`、红走 `gh issue create`，两边都贴报告全文。

YAML 已用 `python3 -c "yaml.safe_load(...)"` 验证可解析。
顶部注释写明**没有远端时不生效**，并标了推远端前要补的三处 TODO
（`DSH_PLUGINS_REPO` 仓库 slug、token 权限、本机先验绿）。
按 brief 要求，没有为这个 yml 改动任何其他文件。

### 4. `README.md`

- 新增「## 定位」小节，开头就是准绳原句（原来的一句话描述精修成准绳 + 三行展开）。
- 「升级官方版本」原本是三步手工流程，已被本阶段的脚本取代，改为三条命令 +
  指向 `UPGRADE.md`。这是本阶段交付物直接造成的过时描述，属于本次改动波及范围。

---

## 实测输出

### `--check`（当前应为「已最新」）

```
$ node scripts/sync-upstream.mjs --check
✔ 已最新：repo 锁定 0.1.0-rc.6，npm 最新 0.1.0-rc.6

报告：/Users/byron/Desktop/Projects/Devs/deepbuddy/reports/upstream-sync/2026-08-17.md
EXIT=0
```

报告里记的版本对：

```
| repo 锁定（@deepseek-ai/dsh-client-runtime） | `0.1.0-rc.6` |
| npm 最新 | `0.1.0-rc.6` |
| dsh CLI dist-tags | `{"latest":"0.1.0-rc.6","next":"0.1.0-rc.6"}` |

锁定的包（4）：`@deepseek-ai/dsh-api-remotes`、`@deepseek-ai/dsh-client-connection`、
`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-slots`
```

### `--apply`（应短路）

```
$ node scripts/sync-upstream.mjs --apply
✔ 已最新：repo 锁定 0.1.0-rc.6，npm 最新 0.1.0-rc.6 —— --apply 短路，未改任何文件
EXIT=0
```

`git status --short` 无任何 manifest 改动。

### `--smoke`（3082，未动 3081 上 pid 90928 的开发服务）

```
$ node scripts/sync-upstream.mjs --smoke
冒烟：/Users/byron/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh --profile deepbuddy --port 3082
  [PASS] 首页 + client bundle — / → 200；client.js → 200；ModuleLoader 头 在
  [PASS] agentPreset.list — ok=true；presets=4 [standard, code, minimal, cordis]
  [PASS] session.list → workspaceShell/listDirectory — session-c2fb7286-0fe1-4fff-88c2-e9da01cbbfe2 cwd=/Users/byron/Desktop/Docs；ok=true；7 个条目
  [PASS] boot 清单含两个自有 entry — 40 个 entry；dsh-plugin-deepbuddy / dsh-plugin-workspace-shell 都在
✔ 冒烟通过（4 PASS / 0 SKIP）
EXIT=0
```

跑完 3082 无监听残留，3081 的 pid 90928 全程不变。

### 额外实测 A：真实 bump 全链路（brief 未要求，但这是 `--apply` 唯一没被短路覆盖的路径）

把 `plugins/deepbuddy/package.json` 的四个 pin 临时降到 `0.1.0-rc.3`，让 `--apply` 真跑：

```
↑ 升级 0.1.0-rc.3 → 0.1.0-rc.6
  bump 的清单：deepbuddy (4)
  [PASS] pnpm install (exit 0)
  [PASS] pnpm --filter dsh-plugin-deepbuddy build (exit 0)
  [PASS] pnpm --filter dsh-plugin-deepbuddy test (exit 0)
  [PASS] pnpm --filter dsh-plugin-deepbuddy typecheck (exit 0)
  [PASS] (workspace-shell) pnpm test (exit 0)
  ... 四项冒烟全 PASS ...
✔ 升级绿灯：0.1.0-rc.3 → 0.1.0-rc.6，门禁与冒烟全通过
EXIT=0
```

结束后 manifest 与 `pnpm-lock.yaml` 与原始文件 `diff` 无差异。

### 额外实测 B：门禁失败回滚

同样降到 rc.3，把 `WORKSPACE_SHELL_DIR` 指向一个 `pnpm test` 必失败的桩目录：

```
↑ 升级 0.1.0-rc.3 → 0.1.0-rc.6
  bump 的清单：deepbuddy (4)
  [PASS] pnpm install (exit 0)
  [PASS] pnpm --filter dsh-plugin-deepbuddy build (exit 0)
  [PASS] pnpm --filter dsh-plugin-deepbuddy test (exit 0)
  [PASS] pnpm --filter dsh-plugin-deepbuddy typecheck (exit 0)
  [FAIL] (workspace-shell) pnpm test (exit 1)
✗ 失败层级：workspace-shell 契约门禁（`(workspace-shell) pnpm test`）—— 已回滚 bump 与 lockfile
EXIT=1
```

回滚后 manifest 四个 pin 回到 rc.3、`pnpm-lock.yaml` 与 bump 前**字节一致**。

### 额外实测 C：workspace-shell 缺席时 SKIP（也是把仓库恢复到 rc.6 的那一跑）

```
  [SKIP] workspace-shell 契约门禁 —— /tmp/does-not-exist-ws 不存在
  ... 四项冒烟全 PASS ...
✔ 升级绿灯：0.1.0-rc.3 → 0.1.0-rc.6，门禁与冒烟全通过
EXIT=0
```

报告里同时留了一条醒目的 ⚠️：该门禁未运行、要在有该仓库的机器上补跑。
跑完 `diff` 确认 manifest 与 lockfile 与本阶段动手前完全一致。

### 额外实测 D：端口占用 fail-fast（修掉的缺陷）

```
$ SMOKE_PORT=3081 node scripts/sync-upstream.mjs --smoke
✗ 起服务失败：端口 3081 已被占用（HTTP 200）：冒烟必须验证自己起的服务。换 SMOKE_PORT，或先停掉占用者。
EXIT=1
```

---

## 修掉的缺陷：冒烟会给别人的服务打分

第一版 `bootServer` 只是「轮询到 `/` 返回 200 就算起来了」。用 `SMOKE_PORT=3081`
实测时，四项冒烟**全 PASS**——但那是 3081 上早就跑着的开发服务答的，
脚本自己 spawn 的子进程因 EADDRINUSE 早死了（日志文件是空的）。
即：一次「冒烟通过」可能完全没验到本次组装出来的东西。

修法是 spawn 之前先探端口，有人应答就直接抛：

```js
async function assertPortFree(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`)
    throw new Error(`端口 ${port} 已被占用（HTTP ${res.status}）：…`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('端口 ')) throw error
    // 其余都是连接被拒，正是我们要的
  }
}
```

fail-fast 而不是自动换端口：自动换端口会让「冒烟到底验的是哪个 profile」变得不确定。

---

## 与 brief 的偏差

**回滚不用 `git -C <repo> checkout -- .`，改为字节级快照还原。**

brief 写「任一步失败：`git -C <repo> checkout -- .` 回滚 bump」。两个问题：

1. **这个仓库一个 commit 都没有**（`git log` → `your current branch 'master'
   does not have any commits yet`，全部文件都是 `??` 未跟踪）。
   `git checkout -- .` 在这里是 no-op，回滚根本不会发生，
   失败的 bump 会留在树里。
2. 即使将来有了 commit，`checkout -- .` 是**全树**操作，会连带抹掉与本次升级
   无关的未提交改动——违反外科手术式修改。

实现改为：bump 之前把每个要改的 `package.json` 与 `pnpm-lock.yaml` 的原始字节
存进内存，失败时逐个写回。与 git 状态无关，且只碰自己改过的文件。
额外实测 B 证明了它有效（回滚后与 bump 前字节一致）。

---

## 改动文件清单

```
A  scripts/sync-upstream.mjs
A  UPGRADE.md
A  .github/workflows/upstream-sync.yml
A  reports/upstream-sync/2026-08-17.md          （本次实测的报告，入库）
M  README.md                                     （新增「定位」小节；升级段改指脚本）
A  .agents/handoffs/2026-08-17-phase3-upstream-sync.md
```

未改：`.gitignore`（按 brief，`reports/` 不加）、`plugins/**`、`apps/**`、
`pnpm-lock.yaml`、官方包、`~/Desktop/Projects/Devs/deepseek-harness`、
`~/Desktop/Projects/Devs/dsh-plugins`（只读它的测试来写 UPGRADE.md）。
**未 commit。**

## 未完成 & 下一步

- **CI 从未真实运行过**：仓库无远端，yml 只做了 YAML 可解析性验证。
  推远端后第一次跑一定要用 `workflow_dispatch` 手动触发验证，别等周一调度。
  顶部三处 TODO 必须先补齐。
- **CI 上的冒烟第 3 项一定是 SKIP**：runner 没有历史会话。
  rc.6 回归卡在 CI 上只覆盖到「端点存在且不报错」这一半，
  「冷会话回退」那一半仍然只有本机验收清单和 workspace-shell 的 5 条单测在守。
- **`--apply` 只在同一台机器上验过**。Linux runner 上 `process.kill(-pid)`
  进程组语义与 macOS 一致，但 dsh 的启动时间可能超 30s，
  第一次 CI 跑要留意 `BOOT_TIMEOUT_MS`。
- 新增精选插件时，记得同步在 `--apply` 的门禁循环里加一条（UPGRADE.md 准入第 1 条）。

## 关键决策与约束

- **准绳进了三份文档的开头**：README「定位」小节、UPGRADE.md 开篇、yml 顶部注释。
- **官方包零修改是硬约束**，兼容问题一律修在自有插件层；踩到新漂移的顺序固定为
  「先固化测试 → 再改自有插件 → 最后记 handoff」，写进 UPGRADE.md。
- **`reports/` 入库不 gitignore**，理由写在 UPGRADE.md：报告是「这个版本在这台机器上
  这天是绿的」的唯一证据。同日多次运行是追加不是覆盖。
- **冒烟绝不复用已有服务**，端口占用即失败。
- **CI 缺 workspace-shell 时 SKIP 但大声报告**，不静默变绿。
- **脚本零新依赖**：管依赖的工具不该先要求装依赖。

## 复测入口

```sh
cd ~/Desktop/Projects/Devs/deepbuddy

node scripts/sync-upstream.mjs --check     # 期望：已最新，exit 0
node scripts/sync-upstream.mjs --apply     # 期望：短路，未改任何文件，exit 0
node scripts/sync-upstream.mjs --smoke     # 期望：4 PASS / 0 SKIP，exit 0（3082，别撞 3081）

# 端口占用 fail-fast
SMOKE_PORT=3081 node scripts/sync-upstream.mjs --smoke   # 期望：exit 1，报端口被占

# 真实 bump / 回滚（会改文件，跑之前先备份这两个）
cp plugins/deepbuddy/package.json /tmp/o.json && cp pnpm-lock.yaml /tmp/o.lock
node -e "const f=require('fs'),p='plugins/deepbuddy/package.json';f.writeFileSync(p,f.readFileSync(p,'utf8').replaceAll('0.1.0-rc.6','0.1.0-rc.3'))"
node scripts/sync-upstream.mjs --apply                    # 期望：全绿，文件回到 rc.6
diff /tmp/o.json plugins/deepbuddy/package.json && diff /tmp/o.lock pnpm-lock.yaml

# YAML 可解析性
python3 -c "import yaml;yaml.safe_load(open('.github/workflows/upstream-sync.yml'))"
```
