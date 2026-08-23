# wave9：配置隔离——DeepBuddy 一律跑在 DSH_HOME=~/.deepbuddy

- 日期 / agent：2026-08-23 / claude
- 目标：发行版配置与官方 `~/.dsh` 隔离，统一放 `~/.deepbuddy`。
- git 基线：`f318576`。**未 commit**。
- 复测入口：`./scripts/deepbuddy --port 3082 --no-open`（浏览器 http://127.0.0.1:3082）。

## 机制

`@deepseek-ai/dsh-home-paths` 的 `resolveDshHome(configured, env)` 顺序为
`configured > $DSH_HOME > ~/.dsh`，单根包含 settings/profiles/sessions/credentials/
storages 全部用户数据。故启动器设 `DSH_HOME="$HOME/.deepbuddy"` 即可让发行版
完全落在隔离根，与官方 `~/.dsh` 互不可见。

## 交付物

### 1. 启动器 `scripts/deepbuddy`（shell，可执行）
- 计算 `REPO_ROOT`、检查 `node_modules/.bin/dsh` 可执行（缺失 fail-fast，不静默兜底）。
- 首次运行（`~/.deepbuddy` 不存在）迁移；否则跳过。
- `export DSH_HOME="$HOME/.deepbuddy"`，`exec node_modules/.bin/dsh --profile
  deepbuddy "$@"`（透传参数）。

### 2. 首次运行迁移（仅当 `~/.deepbuddy` 不存在）
从 `~/.dsh` **复制**（非移动，官方目录一个字节不改）：
- 文件：`settings.yaml`、`.credentials.yaml`、`.anonymous-user-id`（`cp -P`）。
- 目录：`.agent-presets/`、`storages/`、`sessions/`、`profiles/deepbuddy/`
  （`cp -RP` 保留符号链接——`profiles/deepbuddy/node_modules/dsh-plugin-deepbuddy`
  是指向本仓库的 symlink，复制成实体就断热更新）。
- 不复制官方专属 `profiles/web`/`profiles/headless`。
- 迁移日志打印来源/目标；`~/.deepbuddy` 已存在则跳过（无 merge/同步）。
- 坑已修：`cp -RP profiles/deepbuddy` 前需 `mkdir -p $DEEP_BUDDY_HOME/profiles`
  （否则 cp 目标不存在失败）。

### 3. 文档
- `package.json`：加 `"bin": {"deepbuddy": "scripts/deepbuddy"}`。
- `README.md`：新增「启动方式」（`./scripts/deepbuddy --port XXXX`）与「配置隔离」
  说明（数据在 ~/.deepbuddy；与官方 ~/.dsh 自迁移时刻起分叉，之后互不可见）。
- `deepbuddy-design-current/ARCHITECTURE.md` §9 Electron 边界：加「配置隔离（wave 9）」
  一条（说明 DSH_HOME、复制语义、cp -RP 保留符号链接）。

## 验证（全部通过）

- **首次运行迁移**：`~/.deepbuddy` 生成、结构完整（settings/credentials/
  anonymous-user-id/.agent-presets/storages/sessions/profiles/deepbuddy）。
  profile symlink 保留（`ls -la ~/.deepbuddy/profiles/deepbuddy/node_modules/`
  显示 `dsh-plugin-deepbuddy -> ../../../../Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy`）。
- **官方目录只读**：迁移前后 `~/.dsh` 校验和不变——
  文件 73 个、符号链接 539 个、文件 shasum `18c53f28...`、符号链接目标
  shasum `8a231fcf...`（迁移前后完全一致）。
- **经启动器起 3082**：boot 无 toast；会话列表完整（GPT-Image2分享/deepseek-harness/
  Docs/未分组，sessions 迁移过来了）；发一条消息有回复（`.credentials.yaml` 生效）。
- **设置写入隔离**：`~/.dsh/settings.yaml` shasum 保持 `ff745c52...`（不变），
  `~/.deepbuddy/settings.yaml` 变为 `53b447e1...`（设置项改动落到隔离根）。
- **二次启动跳过迁移**：日志
  `~/.deepbuddy already exists — skipping first-run migration (no merge/sync)`。
- **pnpm build && pnpm typecheck && pnpm test 全绿**：deepbuddy 55 条 /
  terminal-probe 5 条。

## 关键决策 / 依据

- **复制非移动**：官方 `~/.dsh` 是官方客户端的活跃数据目录，任何时候都不许改；
  迁移只复制发行版需要的最小集。
- **`cp -RP` 保真理**：`profiles/deepbuddy/node_modules/dsh-plugin-deepbuddy` 是指向
  仓库的符号链接，复制成实体目录会断热更新/损坏链接。
- **不复制 web/headless**：那是官方发行版的 profile，DeepBuddy 不用。
- **跳过即分叉**：迁移是一次性的；之后 `~/.deepbuddy` 与 `~/.dsh` 各自演进，
  互不可见——用户改语言/默认模型不会再殃及官方客户端。

## 未完成 / 下一步

- 无阻塞项。`scripts/deepbuddy` 已注册为 `bin`，`pnpm install` 后可用 `deepbuddy` 命令。
- 二次及之后的运行走已迁移的 `~/.deepbuddy`；如需重置隔离根，删 `~/.deepbuddy`
  后重新运行启动器会重新迁移。
