# DeepBuddy 阶段 1：自绘 UI 迁入发行版 repo handoff

- 日期 / agent：2026-08-17 / claude
- 目标：把 DeepBuddy 自绘 UI 插件从 dsh-plugins 迁进 `~/Desktop/Projects/Devs/deepbuddy`，改常驻挂载，
  装进 `deepbuddy` profile 并起服务冒烟，补齐发行版骨架文档。

## 结论

8 步全部完成，构建 / 测试 / typecheck 全绿，`dsh --profile deepbuddy --port 3081` 在跑（pid 22288），
`/` 与插件 client bundle 都是 200。**两处照着 brief 的命令/路径会失败，已按实际接口修正**（见「与 brief 的偏差」）。

## 每步命令 + 实际输出

### 1. 清理旧方案残留

```sh
rm -rf plugins/frame plugins/theme
```
`plugins/` 清空。全仓 grep `plugins/frame|plugins/theme|dsh-plugin-frame|dsh-plugin-theme`
只剩 brief 自身一处引用，无残留。

### 2. 迁移插件

`cp -R` 了 `src/`、`tests/`、`build.mjs`、`tsconfig.json`、`cordis.patch.yml`、`package.json`、`README.md`，
`find -name .DS_Store -delete`。未带 `design_handoff_atlas_harness/`、`Atlas Harness 交互 Demo v2.html`、
`WorkBuddy UI布局复刻.zip`、`lib/`。老仓库未改动。

### 3. 改为常驻挂载

- `src/client/index.tsx` 重写头部注释与 `apply`：删 `StockSwitch`、`shell.overlay` 注册、
  `localStorage['deepbuddy:shell']`、`toStock`/`toDeepBuddy`/`mountDeepBuddy`、Electron UA 判断、
  `import type {} from '@deepseek-ai/dsh-client-ui-layout/client'`。
  `apply` 现在只剩两个 effect：`installStyles` 和
  `ctx.effect(() => ctx.slots.register({ name: 'root', priority: ROOT_SHADOW_PRIORITY }, DeepBuddyRoot), 'deepbuddy: root shadow')`。
- `AppFrame.tsx`：`DeepBuddyFrame` props 由 `{ dsh, switchShell }` 收窄为 `{ dsh }`。
- `Conversation.tsx`：删掉标题栏「官方界面」按钮（14 行），其余控件不动。
- `package.json`：devDeps 删 `@deepseek-ai/dsh-client-ui-layout`；description 改发行版表述。
  其余依赖保持 `0.1.0-rc.6`。**`dsh.client.inject` 里的 `@deepseek-ai/dsh-client-ui-layout` 保留**——
  那是 boot 图的加载顺序声明（指向 profile 里的运行时插件），不是本包的 npm 依赖，删掉会丢失
  「ui-layout 先注册 root、DeepBuddy 再 shadow」的顺序保证。
- `tests/plugin.test.mjs`：原本没有 shell 切换/书签断言，新增一条常驻挂载断言
  `client bundle mounts the root shadow unconditionally`（bundle 里有 `ROOT_SHADOW_PRIORITY = -1`
  和 `{ name: "root", priority: ROOT_SHADOW_PRIORITY }`，且不含 `deepbuddy:shell` / `shell.overlay`）。
- 插件 `README.md`：「可切换皮肤 / 默认值分形态 / 双向入口」三条改成「常驻挂载」；安装命令改
  `--profile deepbuddy`；`design_handoff_*` 路径改为指向仓库根 `design/`；workspace-shell 由
  「同仓」改为按包名引用。

### 4. workspace 安装与构建

```sh
pnpm install
pnpm --filter dsh-plugin-deepbuddy build && pnpm --filter dsh-plugin-deepbuddy test && pnpm --filter dsh-plugin-deepbuddy typecheck
```

首次 build 失败：`esbuild` 解析不到。老仓库把它放在 workspace 根 devDependencies，
本 repo 根 `package.json` 缺这一条 → **补 `"esbuild": "^0.28.2"` 到根 devDependencies**，install 后通过。

实际输出：
- build：`lib/index.js 88b`、`lib/client.js 125.3kb` + `client.js.map 189.4kb`。
- test：`tests 5 / pass 5 / fail 0`（含新增的常驻挂载断言）。
- typecheck：`tsc --noEmit` 无输出，exit 0。

### 5. profile 组装

`~/.dsh/profiles/deepbuddy/package.json` 原来只有 `["@deepseek-ai/dsh-base"]`，**缺 `@deepseek-ai/dsh-web-app`**，
按 web profile 的样式补上。然后：

```sh
DSH=/Users/byron/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh   # 0.1.0-rc.6
"$DSH" plugin --profile deepbuddy add ~/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy
"$DSH" plugin --profile deepbuddy add /Users/byron/Desktop/Projects/Devs/dsh-plugins/plugins/workspace-shell
"$DSH" --profile deepbuddy --dump-config | grep '^# =='
```

两次 add 都成功（`link:` 依赖）。profile 最终 bundles：
`["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-plugin-deepbuddy", "dsh-plugin-workspace-shell"]`。
tiny-window 未装。`--dump-config` 尾部可见：

```
# == dsh-plugin-deepbuddy
- id: deepbuddy
  name: dsh-plugin-deepbuddy
# == dsh-plugin-workspace-shell
- id: workspace-shell
  name: dsh-plugin-workspace-shell
```

### 6. 起服务冒烟

```sh
dsh --profile deepbuddy --port 3081        # 日志：/tmp/deepbuddy-web-3081.log
```

输出 `dsh web: http://127.0.0.1:3081`，pid 22288，**服务保持运行**（供后续视觉验收）。

```
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3081                          → 200
curl -s -o /dev/null -w '%{http_code}' .../plugins/dsh-plugin-deepbuddy/client.js     → 200
head -c 200 → window.__ModuleLoader__.load({ id: "dsh-plugin-deepbuddy", factory: (require) => { …
```

boot 清单里 `dsh-plugin-deepbuddy` 与 `dsh-plugin-workspace-shell` 两个 entry 都在，
官方 37 个 `@deepseek-ai/dsh-client-ui-*` entry 一并加载（服务全部存活）。
bundle 内含 `ROOT_SHADOW_PRIORITY = -1`。

### 7. Electron 壳

`apps/desktop/main.js`：`backgroundColor` `#f3f2f2` → `#fafaf9`；文件头注释与 `DSH_WEB_URL`
说明改为指向 `dsh --profile deepbuddy`，默认 URL 保持 `http://127.0.0.1:3080`。
`apps/desktop/README.md` 同步（运行命令、端口说明、后续项）。壳未实际启动验证（阶段 1 不含）。

### 8. 根 README.md

新建，中文：三层结构 ASCII 图 + 各层职责、安装 6 步（含 profile bundles 打底与端口注意事项）、
开发命令、升级官方版本的三步。无营销话术。

## 与 brief 的偏差（照 brief 原文会失败）

1. **起服务命令**：brief 写 `dsh --profile deepbuddy web --port 3081`，实际报
   `error: web takes none of parent --profile, --patch, --dump-config, or --dump-default-config`。
   `dsh --help` 说明 `web` 是 `--profile web` 的**别名**，两者互斥。正确写法：
   `dsh --profile deepbuddy --port 3081`（profile app 的 flag 直接跟在启动器 flag 后面）。
2. **client bundle 路径**：brief 写 `/plugins/deepbuddy/client.js`（404）。web server 按**包名**挂载，
   实际是 `/plugins/dsh-plugin-deepbuddy/client.js`。
3. **根 devDependencies 补 esbuild**：brief 未提，但不补则 `build.mjs` 无法解析 `esbuild`
   （老仓库同样把它放在 workspace 根）。

## 改动文件清单

本 repo（`~/Desktop/Projects/Devs/deepbuddy`）：

```
D  plugins/frame/**                       (7 文件，整目录删)
D  plugins/theme/**                       (2 文件，整目录删)
A  plugins/deepbuddy/build.mjs            (原样迁入)
A  plugins/deepbuddy/cordis.patch.yml     (原样迁入)
A  plugins/deepbuddy/tsconfig.json        (原样迁入)
A  plugins/deepbuddy/src/host.js          (原样迁入)
A  plugins/deepbuddy/src/client/{dsh,files,geometry,mock,styles}.ts        (原样迁入)
A  plugins/deepbuddy/src/client/{icons,ui,Sidebar,WorkspacePanel,SettingsDialog}.tsx (原样迁入)
A  plugins/deepbuddy/src/client/index.tsx        (迁入 + 改常驻挂载)
A  plugins/deepbuddy/src/client/AppFrame.tsx     (迁入 + 删 switchShell prop)
A  plugins/deepbuddy/src/client/Conversation.tsx (迁入 + 删「官方界面」按钮)
A  plugins/deepbuddy/package.json         (迁入 + 删 ui-layout devDep、改 description)
A  plugins/deepbuddy/README.md            (迁入 + 常驻挂载/路径修正)
A  plugins/deepbuddy/tests/plugin.test.mjs(迁入 + 新增常驻挂载断言)
M  package.json                           (加 esbuild devDep、改 description)
M  apps/desktop/main.js                   (backgroundColor、注释)
M  apps/desktop/README.md                 (profile 命令、端口说明)
A  README.md                              (新建)
A  .agents/handoffs/2026-08-17-phase1-migration.md
```

仓库外：`~/.dsh/profiles/deepbuddy/package.json`（加 `@deepseek-ai/dsh-web-app` bundle，
两次 `plugin add` 追加的 `link:` 依赖与 bundle 条目）。

未 commit（brief 要求）。`~/Desktop/Projects/Devs/deepseek-harness` 与
`~/Desktop/Projects/Devs/dsh-plugins` 均未改动。

## 未完成 & 下一步

- **视觉验收未做**：服务在 3081 跑着，还没在浏览器/Electron 里看过实际渲染。
  下一步：开 `http://127.0.0.1:3081` 确认 DeepBuddy 三栏骨架是唯一界面、官方 shell 不出现。
- **Electron 壳未跑过**：`DSH_WEB_URL=http://127.0.0.1:3081 pnpm --filter deepbuddy-desktop start`
  或截图钩子 `DSH_DESKTOP_SCREENSHOT=/tmp/deepbuddy.png` 未执行。
- **`pnpm-workspace.yaml` 缺 `onlyBuiltDependencies: [electron]`**（老仓库有）。目前 electron
  已在 `apps/desktop/node_modules` 装上，但没跑过 postinstall；壳启动失败时先补这一条再 `pnpm install`。
- **基础能力对齐未开始**（阶段 2）：四种模式 `ctx.agentPresets`、插件自创作入口、审批/提问
  `interaction`、模型选择、Trajectory——目前 DeepBuddy 里权限三档与模型选择仍是 UI 占位，
  浏览器/概览/Git 三个面板视图仍是演示数据。
- 插件 `AppFrame.tsx` 顶部注释仍写 `design_handoff_atlas_harness/Desktop Harness.dc.html`
  （现路径 `design/design_handoff_atlas_harness/…`），外科手术式迁移下未动。

## 关键决策与约束

- 发行版内 DeepBuddy 是**唯一 UI**，不做双 shell 切换；机制是 root slot `priority: -1` 常驻 shadow，
  官方 ui-layout 行保持启用、占用者保持注册但不渲染 → 官方服务全部存活。
- 官方层零 diff：core 与官方 web UI 插件锁 `0.1.0-rc.6`，一行不改；升级 = bump 依赖 + 重跑测试。
- `dsh.client.inject` 保留 ui-layout（加载顺序声明 ≠ npm 依赖），只删 devDependencies。
- 3080 归 web profile，deepbuddy profile 用 3081。
- tiny-window 不装进 deepbuddy profile。

## 验收记录（fable，同日）

- 复跑 `pnpm --filter dsh-plugin-deepbuddy test`（5/5）与 `typecheck`，绿；3081 HTTP 200。
- 浏览器验收（Chrome @3081）：DeepBuddy 三栏为唯一界面、无切换书签；真实会话列表（16 条）；
  打开「介绍AI助手功能」渲染 89→92 条消息含工具块折叠；发送两条真实 prompt 均得到模型回复
  （流式指示、端到端通）。截图：`assets/2026-08-17-phase1-hero.png`、`assets/2026-08-17-phase1-conversation.png`。
- Electron 壳验收：补 `pnpm-workspace.yaml` `onlyBuiltDependencies: [electron]` 并手跑
  `node install.js` 下载二进制后，`DSH_WEB_URL=http://127.0.0.1:3081 DSH_DESKTOP_SCREENSHOT=… electron .`
  出图正常（原生红绿灯占位、真实数据）。截图：`assets/2026-08-17-phase1-desktop.png`。
- **发现上游漂移（阻塞文件树）**：rc.6 下 `workspaceShell/listDirectory` 对所有会话返回
  `session-not-found`（rc.5 正常；同 sessionId 的 `session.history` 正常，运行中会话也拒绝）。
  根因：rc.6 agent plane 进 preset realm 后 host 插件行的 `ctx.sessions.get` 不见网关托管会话；
  网关冷会话走 `sessionPersistence.list()` 取 header.cwd。修复方案见
  `briefs/2026-08-17-phase2-presets-and-plugins.md` 前置任务 0（改 dsh-plugins 的 workspace-shell host）。
  这正是「发行版升级官方版本」要防的兼容类别——今后 bump 版本必须把文件树纳入冒烟清单。

## 复测入口

```sh
cd ~/Desktop/Projects/Devs/deepbuddy
pnpm install
pnpm --filter dsh-plugin-deepbuddy build && pnpm --filter dsh-plugin-deepbuddy test && pnpm --filter dsh-plugin-deepbuddy typecheck

DSH=/Users/byron/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh
"$DSH" --profile deepbuddy --dump-config | grep '^# =='
"$DSH" --profile deepbuddy --port 3081            # 已在跑：pid 22288，日志 /tmp/deepbuddy-web-3081.log
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3081
curl -s http://127.0.0.1:3081/plugins/dsh-plugin-deepbuddy/client.js | head -c 200
```
