# wave10：打包 DeepBuddy.app（Electron，自包含，鲸鱼图标）

- 日期 / agent：2026-08-23 / claude
- 目标：把 apps/desktop 开发壳升级为双击可用的自包含 DeepBuddy.app
  （自己拉起 dsh、鲸鱼图标、无孤儿 dsh）。
- git 基线：`5a2b6e6`。**未 commit**。
- 复测入口：`open apps/desktop/dist/mac-arm64/DeepBuddy.app`；产物
  `apps/desktop/dist/DeepBuddy-0.1.0-arm64.dmg`（165MB）+
  `apps/desktop/dist/mac-arm64/DeepBuddy.app`。

## A. 主进程（apps/desktop/main.js 全量重写）

- 找空闲端口（net.listen(0)）→ spawn 打包内 dsh（`ELECTRON_RUN_AS_NODE=1` +
  `process.execPath`，Electron 38 内置 Node v22.22.0 ≥ dsh 的 22.19 引擎）→
  轮询 HTTP 200 → loadURL。
- `DSH_HOME=~/.deepbuddy`（与启动器一致的隔离根）；首次运行用 JS 做迁移
  （settings/credentials/anonymous-id/.agent-presets/storages/sessions，
  `fs.cpSync(... dereference:false)` = cp -RP 语义，~/.dsh 只读）。
- killed on quit：`before-quit` + `win.on('closed')` → `killChild`（SIGTERM
  进程组 + child.kill），无孤儿 dsh。
- Dev 模式（无打包资源 `process.resourcesPath/dsh-runtime` 不存在）回落到
  `DSH_WEB_URL`（默认 3080），不 spawn 不迁移，旧行为保留。
- **卡点（已修）**：spawn 必须以 `binPath`（dsh 的 lib/bin.js）作为 Node 首参，
  不能 `['--profile', ...]`（Electron 会把 `--profile` 当 Electron 选项拒掉，
  报 `bad option: --profile`）。
- **坑（记录）**：staging runtime 是 flat（node_modules 内容在 runtime 根，
  无 runtime/node_modules），但 ESM 裸说明符仍能解析（实测 dsh 正常启动）——
  因其结构与 hoisted 布局一致，Node 按父级 scope 目录逐级解析。

## B. 自包含运行时 + app 专属 profile

- `apps/desktop/stage-runtime.sh`：用 pnpm `node-linker=hoisted` 在**工作区外**的
  临时目录 `pnpm install @deepseek-ai/dsh@0.1.1-rc.2 --prod --ignore-scripts`
  （真实文件、无 pnpm 符号链接），再 mv 到 `apps/desktop/staging/runtime`；
  复制 `plugins/deepbuddy` 的 lib/ + package.json + cordis.patch.yml 到
  `apps/desktop/staging/plugin`。
  - **坑**：`npm install` 在巨型依赖图上超时挂起（300s+ 未完成）——改用 pnpm
    hoisted（复用全局 store，仅 12s），又快又是真实文件。
  - **坑**：pnpm 在工作区子目录跑会冲突（repo node_modules 装了 devDep，--prod
    想删）+ 污染 repo 根——必须在工作区外的临时目录安装后拷入。
- electron-builder `extraResources`：`staging/runtime` → `dsh-runtime`，
  `staging/plugin` → `deepbuddy-plugin`。
- **app 专属 profile**：main.js `ensureDesktopProfile()` 幂等生成
  `~/.deepbuddy/profiles/desktop`（cordis.yml / cordis.patch.yml / package.json
  bundles [dsh-base, dsh-web-app, dsh-plugin-deepbuddy]），其
  `node_modules/dsh-plugin-deepbuddy` 是**复制**（非符号链接）自
  `deepbuddy-plugin`（断 repo 热更新）+ 打包内运行时。启动 `--profile desktop`。
  - 机制（已核实源码）：dsh 启动 `healProfilesModuleFallback(INSTALL_ANCHOR)`
    把安装树依赖链接进 `$DSH_HOME/profiles/node_modules`；`resolveBundleDir`
    安装优先解析 base/web-app——故 desktop profile 只需 bundles tuple + 插件
    副本，base/web-app 从打包运行时取。
  - dev 的 `deepbuddy` profile 完全不动（其插件仍符号链接回 repo，3081 热更新
    不受影响）。

## C. 图标

- ImageMagick 从仓库根 `icon.png`（2048）产 Big Sur 风格：
  824px 内容居中于 1024 画布，`roundrectangle 0,0 1023,1023 185,185` 蒙版
  `CopyOpacity` 得四角透明（apex 圆角 185px @1024）。存
  `apps/desktop/build/icon.png`，electron-builder 自动转
  `Contents/Resources/icon.icns`（1024 × 1024，蓝鲸 `srgba(50,118,252,1)`）。
- 窗口 title 保持 DeepBuddy。
- **坑**：`-compose DstIn` 不会产生 alpha 通道（`hasAlpha: no`、角变黑）——改用
  `-alpha off -compose CopyOpacity -composite`。

## D. 打包配置

- `apps/desktop/package.json` 加 devDependency `electron-builder@^25.1.8`；
  `build` 字段：appId `dev.deepbuddy.desktop`、productName `DeepBuddy`、
  asar true、mac arm64 `dir` + `dmg`（hardenedRuntime/gatekeeper 关，不签名）、
  icon `build/icon.png`、`extraResources` staging/plugin。
- 产物：`apps/desktop/dist/mac-arm64/DeepBuddy.app` +
  `apps/desktop/dist/DeepBuddy-0.1.0-arm64.dmg`（+ .blockmap）。
- `.gitignore` 加 `apps/desktop/staging/`、`apps/desktop/dist/`（缓存产物）。

## 验证（清单一律过）

- `pnpm build && pnpm typecheck && pnpm test` 全绿（deepbuddy 55 / terminal-probe 5）。
- **DeepBuddy.app 启动**：`DSH_DESKTOP_SCREENSHOT=/tmp/... DeepBuddy.app/Contents/MacOS/DeepBuddy`
  → 日志 `[dsh] dsh web: http://127.0.0.1:60048`（app 自己拉起 dsh，空闲端口）
  + `[deepbuddy] screenshot written`；截图
  `reports/restructure/w10-app-window.png` 采样：顶左 rgb(27,27,28)（侧栏
  `--dsw-specific-sidebar-fill`）、main rgb(21,21,23)（`--dsw-alias-bg-base`）——
  窗口渲染出侧栏+主列。
- **图标**：`Contents/Resources/icon.icns` 存在（1024×1024），sips 解出首帧
  蓝鲸 `srgba(50,118,252,1)`。
- **无孤儿 dsh**：quit 后 `pgrep -f "profile desktop"` 为空；`pgrep -f
  "dsh/lib/bin.js"` 只剩预置的 dev 3081/3086/官方 web 服务（非本次启动）。
- **`~/.deepbuddy/profiles/desktop`**：cordis.yml/cordis.patch.yml/package.json
  bundles 正确、plugin 是实体复制非符号链接；dev `deepbuddy` profile 完好
  （插件仍符号链接回 repo）；`~/.dsh` wave10 期间无任何文件改动
  （`find ~/.dsh -newermt 14:40` 为空）。
- **Dev 模式**：`cd apps/desktop && npx electron .` → 日志 `dev mode: no
  packaged runtime, loading http://127.0.0.1:3080` + 截图——行为不回退。

## 关键决策 / 依据

- **pnpm hoisted 而非 npm**：npm 在 @deepseek-ai/dsh 巨型依赖图上超时挂起；
  pnpm `node-linker=hoisted` 复用全局 store（12s）且产出真实 flat 文件。
- **工作区外安装**：pnpm 在工作区子目录 `--prod` 会因 repo node_modules 装了
  devDep 而冲突并污染根——必须隔离目录安装。
- **app 专属 desktop profile 而非 dev deepbuddy**：dev profile 插件符号链接回
  repo，会与 3081 热更新互踩；desktop profile 插件实体复制，`--profile desktop`
  隔离。
- **不签名**：无 Developer ID（本机自用）；hardenedRuntime/notarize 关。
- **迁移语义与 scripts/deepbuddy 一致**（注释注明 canonical 在启动器）。

## 未完成 / 下一步

- app 未签名（本地运行无害；若分发需 Developer ID + notarize）。
- 换 harness 预留的 file:// + IPC fetch 通路（摆脱本地 HTTP 端口）——尚未做，
  与打包正交。
- `apps/desktop/README.md` 未更新（现有内容描述 dev 壳，需补打包/启动说明）——
  非本 wave 强制项，后续可补。
