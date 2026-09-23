# Dude

DeepSeek Harness（`dsh`）的桌面发行版：官方界面一件不少、一行不改，Dude 只加
窗口拖拽区域这一样官方没有的东西。
「官方有、Dude 没有」是缺陷；Dude 不再自绘平行界面。

## 文档

开工入口是根目录的 [`AGENTS.md`](AGENTS.md)。
**现行设计只有 [`design/`](design/) 一套**，
按该目录 [`README.md`](design/README.md) 的效力顺序阅读：

| 文件 | 用途 | 约束力 |
|---|---|---|
| [`AGENTS.md`](AGENTS.md) | Coding Agent 开工约束与提交检查（在仓库根） | 执行入口 |
| [`ARCHITECTURE.md`](design/ARCHITECTURE.md) | 系统边界、模块关系、DSH 集成方式 | 最高 |
| [`DESIGN_INTENT.md`](design/DESIGN_INTENT.md) | 窗口拖拽区域的交互基线 | 高 |
| [`DEVELOPMENT_RULES.md`](design/DEVELOPMENT_RULES.md) | 工程约束与检查表 | 高 |
| [`FEATURE_MAP.md`](design/FEATURE_MAP.md) | 当前功能落点、状态 Owner | 当前状态 |
| [`prototype/`](design/prototype/README.md) | 早期自绘界面的可交互原型 | 历史视觉参考，不约束实现 |

代码与现行设计已对齐：Dude 界面本体就是官方 `dsh-web-app`，插件只叠加窗口拖拽
区域。

## 当前实现

```text
┌───────────────────────────────────────────────────────────┐
│ Electron 壳  apps/desktop/                                │  窗口与 dsh 进程
│  hiddenInset 红绿灯 / 打包版起停 dsh / 外链 → 系统浏览器  │
├───────────────────────────────────────────────────────────┤
│ Dude UI 插件  plugins/dude/                               │  本仓库唯一自研代码
│  样式表（拖拽区域 + 红绿灯避让）                          │
├───────────────────────────────────────────────────────────┤
│ 官方 dsh core + web UI 插件（npm 锁 0.1.5-rc.3）          │  零修改
│  @deepseek-ai/dsh-base + @deepseek-ai/dsh-web-app         │
└───────────────────────────────────────────────────────────┘
```

- **官方层零 diff**：core 与全部官方 web UI 插件以 npm 依赖锁版本引入，一行不改。
  官方 `ui-layout`、`ui-sidebar`、`ui-conversation` 都保持启用。`ui-layout` 画窗口骨架并提供 `layout`，`ui-sidebar` 画左栏，dockkit 画右栏。背后的官方服务全部存活。
  锁定版本的右栏只有 Files 页；终端（`ui-sidebar-terminal`）和浏览器
  （`ui-sidebar-browser`）页由上游 0.1.6 加入，升级后才有。
- **Dude UI 插件**：不注册 `root`，不提供第二份 `layout`，没有自己的右栏或检查器。
  只做一件事：装一段样式表（窗口拖拽区域，左栏顶部让出红绿灯）。Hero 用官方的鲸鱼
  标记。`src/host.js` 是空实现，没有 host 侧业务端点。
- **Electron 壳**：一个窗口。打包版自带 dsh runtime，自己起服务再加载；开发时加载
  本地跑着的发行版 profile。详见 `apps/desktop/README.md`。

## 安装

profile 名 `dude`，装在 `$DSH_HOME/profiles/dude`（默认 `~/.dsh`）。启动器首次运行时把它
复制进 `~/.dude`；`~/.dude` 已存在（例如先跑过打包版）时不再迁移，下面的命令要带
`DSH_HOME=~/.dude`，直接装进 `~/.dude/profiles/dude`。

```sh
# 1. profile 打底：从官方 web 模板建，得到 dsh-base 与 dsh-web-app 两个 bundle
dsh --profile dude --from-default-profile web --dump-config > /dev/null

# 2. 装 Dude 插件（host 半部为空实现，纯客户端插件）
dsh plugin --profile dude add /path/to/dude/plugins/dude

# 3. 确认三个 bundle 层都在
dsh --profile dude --dump-config | grep '^# =='

# 4. 起服务（3080 被别的 profile 占用时换端口）
dsh --profile dude --port 3081

# 5. 起壳
DSH_WEB_URL=http://127.0.0.1:3081 pnpm --filter dude-desktop start
```

注意 `dsh web` 是 `--profile web` 的别名，不能和 `--profile dude` 连用；
发行版 profile 用 `dsh --profile dude [--port N]`，端口等参数直接跟在后面。

`dsh` CLI 本体（server 侧 runtime）钉在仓库根 `package.json` 的 devDependencies，
`pnpm install` 后用 `node_modules/.bin/dsh`；启动器已解析此路径，不要依赖全局或
npx 缓存里的版本。

## 启动方式

发行版一律经启动器运行，配置与官方 `~/.dsh` 隔离（wave 9）：

```sh
# 起服务（首次运行自动从 ~/.dsh 迁移配置；端口可换）
./scripts/dude --port 3082 --no-open

# 起壳（壳指向上面启动的 web 端口）
DSH_WEB_URL=http://127.0.0.1:3082 pnpm --filter dude-desktop start
```

`scripts/dude` 设置 `DSH_HOME="$HOME/.dude"` 后 exec
`node_modules/.bin/dsh --profile dude "$@"`（参数透传）。根 package.json 的
`"bin"` 也把它注册为 `dude` 命令。

## 配置隔离

Dude 的用户数据统一放在 `~/.dude`（`DSH_HOME`）：

- 首次运行（`~/.dude` 不存在时）从官方 `~/.dsh` **复制**（不是移动，官方目录
  一个字节不改）：`settings.yaml`、`.credentials.yaml`、`.anonymous-user-id`、
  `.agent-presets/`、`storages/`、`sessions/`、`profiles/dude/`。
- `profiles/dude/` 用 `cp -RP` 复制，保留 `node_modules/dsh-plugin-dude`
  指向本仓库的符号链接（复制成实体目录会断热更新）。
- 不复制官方专属的 `profiles/web` / `profiles/headless`。
- `~/.dude` 已存在则跳过迁移，不做任何 merge/同步——自迁移时刻起，Dude
  配置与官方 `~/.dsh` 分叉，之后互不可见。

两个 profile 共用 `~/.dude` 的设置与会话：

- `profiles/dude`：开发用，启动器 `scripts/dude` 起它，插件链接回本仓库。
- `profiles/dude-app`：打包版 Dude.app 专用，由 `apps/desktop/main.js` 每次启动时生成，
  插件从 app 资源目录复制进来，不链接任何源码仓库。打包版首次运行同样从 `~/.dsh`
  复制设置、凭据、预设、storages 和 sessions，但不复制 `profiles/dude`。

## 开发

```sh
pnpm install
pnpm --filter dsh-plugin-dude build       # lib/index.js + lib/client.js
pnpm --filter dsh-plugin-dude test        # 构建 + bundle 契约测试（12 条）
pnpm --filter dsh-plugin-dude typecheck
```

根脚本 `pnpm build|test|typecheck` 对 `plugins/*` 递归执行同样三件事。
插件以 `link:` 装进 profile，改完源码重新 `build` 后刷新页面即可。

## 升级官方版本

```sh
node scripts/sync-upstream.mjs --check     # 已最新 exit 0；有新版 exit 1
node scripts/sync-upstream.mjs --apply     # bump + install + 门禁 + 冒烟，失败自动回滚
node scripts/sync-upstream.mjs --smoke     # 单独冒烟（3082 起临时服务）
```

冒烟断言三件事：首页和 client bundle 能取到、`agentPresets/list` 返回四个内置预设、
boot 清单含 `dsh-plugin-dude` 这一项。

绿了之后还要人工确认一遍
[`ARCHITECTURE.md` §10「架构验收」](design/ARCHITECTURE.md)列的几项（官方
`ui-layout` / `ui-sidebar` / `ui-conversation` 仍启用、拖拽区域正常、Hero 是官方鲸鱼）
才能 commit。
每次运行的报告追加写 `reports/upstream-sync/<日期>.md`（入库，不 gitignore）。
每周一自动查一次：`.github/workflows/upstream-sync.yml`。

## 设计过程

`.agents/corrections/` 记录每次纠偏，`.agents/handoffs/` 记录各阶段交接。
开工前先读最近 1–2 份。
