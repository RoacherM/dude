# DeepBuddy

DeepSeek Harness（`dsh`）的桌面发行版：官方界面一件不少、一行不改，DeepBuddy 只加
窗口拖拽区域和 Hero 品牌标记两样官方没有的东西。
「官方有、DeepBuddy 没有」是缺陷；DeepBuddy 不再自绘平行界面。

## 文档

开工入口是根目录的 [`AGENTS.md`](AGENTS.md)。
**现行设计只有 [`design/`](design/) 一套**，
按该目录 [`README.md`](design/README.md) 的效力顺序阅读：

| 文件 | 用途 | 约束力 |
|---|---|---|
| [`AGENTS.md`](AGENTS.md) | Coding Agent 开工约束与提交检查（在仓库根） | 执行入口 |
| [`ARCHITECTURE.md`](design/ARCHITECTURE.md) | 系统边界、模块关系、DSH 集成方式 | 最高 |
| [`DESIGN_INTENT.md`](design/DESIGN_INTENT.md) | 窗口拖拽区域与 Hero 品牌标记的交互基线 | 高 |
| [`DEVELOPMENT_RULES.md`](design/DEVELOPMENT_RULES.md) | 工程约束与检查表 | 高 |
| [`prototype/`](design/prototype/README.md) | 高保真可交互原型；UI/交互改动先在此迭代再落实现 | UI 基线 |
| [`FEATURE_MAP.md`](design/FEATURE_MAP.md) | 当前功能落点、状态 Owner | 当前状态 |

代码与现行设计已对齐：DeepBuddy 界面本体就是官方 `dsh-web-app`，插件只叠加窗口拖拽
区域和 Hero 品牌标记。

## 当前实现

```text
┌─────────────────────────────────────────────────────────┐
│ Electron 壳  apps/desktop/                              │  只是窗口
│  hiddenInset 红绿灯 / 拖拽区 / 外链 → 系统浏览器          │
├─────────────────────────────────────────────────────────┤
│ DeepBuddy UI 插件  plugins/deepbuddy/                    │  本仓库唯一自研代码
│  样式表（拖拽区域 + 字体）+ Hero 品牌标记                 │
├─────────────────────────────────────────────────────────┤
│ 官方 dsh core + web UI 插件（npm 锁 0.1.2-rc.*）          │  零修改
│  @deepseek-ai/dsh-base + @deepseek-ai/dsh-web-app        │
└─────────────────────────────────────────────────────────┘
```

- **官方层零 diff**：core 与全部官方 web UI 插件以 npm 依赖锁版本引入，一行不改。
  官方 `ui-layout`、`ui-sidebar`、`ui-conversation` 都保持启用。`ui-layout` 画窗口骨架并提供 `layout`，`ui-sidebar` 画左栏，dockkit 画右栏（含 Files 页）。背后的官方服务全部存活。
- **DeepBuddy UI 插件**：不注册 `root`，不提供第二份 `layout`，没有自己的右栏或检查器。
  只做两件事：装一段样式表（窗口拖拽区域 + Archivo 正文字体），把 DeepBuddy 的鱼形标记
  注册进官方 Hero 的 `conversation.hero.brand.mark` 槽。`src/host.js` 是空实现，没有
  host 侧业务端点。
- **Electron 壳**：一个窗口，加载本地跑着的发行版 profile。详见 `apps/desktop/README.md`。

## 安装

profile 名 `deepbuddy`，装在 `$DSH_HOME/profiles/deepbuddy`（默认 `~/.dsh`）。

```sh
# 1. profile 打底：官方两个 bundle（profile package.json 的 dsh.profile.bundles）
#    ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]

# 2. 装 DeepBuddy 插件（host 半部为空实现，纯客户端插件）
dsh plugin --profile deepbuddy add /path/to/deepbuddy/plugins/deepbuddy

# 3. 确认三个 bundle 层都在
dsh --profile deepbuddy --dump-config | grep '^# =='

# 4. 起服务（3080 被别的 profile 占用时换端口）
dsh --profile deepbuddy --port 3081

# 5. 起壳
DSH_WEB_URL=http://127.0.0.1:3081 pnpm --filter deepbuddy-desktop start
```

注意 `dsh web` 是 `--profile web` 的别名，不能和 `--profile deepbuddy` 连用；
发行版 profile 用 `dsh --profile deepbuddy [--port N]`，端口等参数直接跟在后面。

`dsh` CLI 本体（server 侧 runtime）钉在仓库根 `package.json` 的 devDependencies，
`pnpm install` 后用 `node_modules/.bin/dsh`；不要依赖全局或 npx 缓存里的版本。

## 启动方式

发行版一律经启动器运行，配置与官方 `~/.dsh` 隔离（wave 9）：

```sh
# 起服务（首次运行自动从 ~/.dsh 迁移配置；端口可换）
./scripts/deepbuddy --port 3082 --no-open

# 起壳（壳指向上面启动的 web 端口）
DSH_WEB_URL=http://127.0.0.1:3082 pnpm --filter deepbuddy-desktop start
```

`scripts/deepbuddy` 设置 `DSH_HOME="$HOME/.deepbuddy"` 后 exec
`node_modules/.bin/dsh --profile deepbuddy "$@"`（参数透传）。根 package.json 的
`"bin"` 也把它注册为 `deepbuddy` 命令。

## 配置隔离

DeepBuddy 的用户数据统一放在 `~/.deepbuddy`（`DSH_HOME`）：

- 首次运行（`~/.deepbuddy` 不存在时）从官方 `~/.dsh` **复制**（不是移动，官方目录
  一个字节不改）：`settings.yaml`、`.credentials.yaml`、`.anonymous-user-id`、
  `.agent-presets/`、`storages/`、`sessions/`、`profiles/deepbuddy/`。
- `profiles/deepbuddy/` 用 `cp -RP` 复制，保留 `node_modules/dsh-plugin-deepbuddy`
  指向本仓库的符号链接（复制成实体目录会断热更新）。
- 不复制官方专属的 `profiles/web` / `profiles/headless`。
- `~/.deepbuddy` 已存在则跳过迁移，不做任何 merge/同步——自迁移时刻起，DeepBuddy
  配置与官方 `~/.dsh` 分叉，之后互不可见。

`dsh` CLI 本体（server 侧 runtime）钉在仓库根 `package.json` 的 devDependencies，
`pnpm install` 后用 `node_modules/.bin/dsh`；启动器已解析此路径，不要依赖全局或
npx 缓存里的版本。

## 开发

```sh
pnpm install
pnpm --filter dsh-plugin-deepbuddy build       # lib/index.js + lib/client.js
pnpm --filter dsh-plugin-deepbuddy test        # 构建 + bundle 契约测试（12 条）
pnpm --filter dsh-plugin-deepbuddy typecheck
```

根脚本 `pnpm build|test|typecheck` 对 `plugins/*` 递归执行同样三件事。
插件以 `link:` 装进 profile，改完源码重新 `build` 后刷新页面即可。

## 升级官方版本

```sh
node scripts/sync-upstream.mjs --check     # 已最新 exit 0；有新版 exit 1
node scripts/sync-upstream.mjs --apply     # bump + install + 门禁 + 冒烟，失败自动回滚
node scripts/sync-upstream.mjs --smoke     # 单独冒烟（3082 起临时服务）
```

绿了之后还要人工确认一遍
[`ARCHITECTURE.md` §10「架构验收」](design/ARCHITECTURE.md)列的几项（官方
`ui-layout` / `ui-sidebar` / `ui-conversation` 仍启用、拖拽区域和 Hero 品牌标记正常）
才能 commit。
每次运行的报告追加写 `reports/upstream-sync/<日期>.md`（入库，不 gitignore）。
每周一自动查一次：`.github/workflows/upstream-sync.yml`。

## 设计过程

`.agents/corrections/` 记录每次纠偏，`.agents/handoffs/` 记录各阶段交接。
开工前先读最近 1–2 份。
