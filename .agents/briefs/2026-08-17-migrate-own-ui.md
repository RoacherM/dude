# 任务：把 DeepBuddy 自绘 UI 迁入本 repo，完成发行版骨架（阶段 1）

你在 `~/Desktop/Projects/Devs/deepbuddy`——DeepBuddy 是 **DeepSeek Harness (dsh) 的桌面发行版**：
官方 dsh core + 官方 web UI 插件全部以 npm 依赖锁版本引入、零修改；DeepBuddy 自己的 UI
是一个 dsh 插件（自绘界面，root slot shadow 常驻替换官方 shell）；Electron 只是壳。
本阶段只做**迁移与骨架**，不做新功能。

## 硬约束

- 零底座 diff：不改 `~/Desktop/Projects/Devs/deepseek-harness`（只读参考），不改任何官方 npm 包。
- 外科手术式迁移：不顺手重构、不改无关代码、不删注释。源插件已是 v2 真实数据面版本，逻辑不动。
- 老仓库 `/Users/byron/Desktop/Projects/Devs/dsh-plugins` 只读（迁移源），不要改它。
- 不要 git commit（用户未要求）。
- 构建/客户端打包约定见老仓库 `DEVELOPMENT.md` 与插件内 `build.mjs`（client bundle purity：
  跨插件值导入禁止，platform 模块之外全部内联）。

## 步骤

1. **清理旧方案残留**：删除本 repo 的 `plugins/frame/` 和 `plugins/theme/` 两个目录
   （上一版架构的半成品，已作废）。
2. **迁移插件**：`/Users/byron/Desktop/Projects/Devs/dsh-plugins/plugins/deepbuddy` →
   `~/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy`。
   不要带这些文件（设计资产已在本 repo `design/`）：`design_handoff_atlas_harness/`、
   `Atlas Harness 交互 Demo v2.html`、`WorkBuddy UI布局复刻.zip`、`lib/`（构建产物）。
   带上：`src/`、`tests/`、`build.mjs`、`tsconfig.json`、`cordis.patch.yml`、`package.json`、`README.md`。
3. **改为常驻挂载**（发行版内 DeepBuddy 即唯一 UI，不再做双 shell 切换）：
   - `src/client/index.tsx`：删除 `StockSwitch` 组件、`shell.overlay` 书签注册、
     `localStorage['deepbuddy:shell']`、`toStock`/`toDeepBuddy`、Electron UA 判断；
     `apply` 里直接注册 root shadow（`ctx.slots.register({name:'root', priority:-1}, DeepBuddyRoot)`），
     disposer 交给 `ctx.effect` 管理。删除 `import type {} from '@deepseek-ai/dsh-client-ui-layout/client'`。
   - `DeepBuddyFrame` 的 `switchShell` prop 及其传递删掉；`Conversation.tsx` 标题栏的
     「官方界面」按钮删掉。
   - `package.json`：devDeps 删除 `@deepseek-ai/dsh-client-ui-layout`；description 更新为
     发行版 UI 表述；其余依赖版本保持 `0.1.0-rc.6` 不动。
   - 如 `tests/` 里有断言 shell 切换/书签的用例，同步更新为常驻挂载断言。
4. **workspace 安装与构建**：repo 根 `pnpm install`，然后
   `pnpm --filter dsh-plugin-deepbuddy build && pnpm --filter dsh-plugin-deepbuddy test && pnpm --filter dsh-plugin-deepbuddy typecheck`
   全绿。
5. **profile 组装**（dsh 二进制：`/Users/byron/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh`）：
   - `~/.dsh/profiles/deepbuddy` 已初始化过；先看它的 `package.json` 是否含
     `dsh.profile.bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]` 打底
     （参考 `~/.dsh/profiles/web/package.json` 的结构）；缺就按 web profile 的样式补上这两个官方 bundle。
   - `dsh plugin --profile deepbuddy add ~/Desktop/Projects/Devs/deepbuddy/plugins/deepbuddy`
   - `dsh plugin --profile deepbuddy add /Users/byron/Desktop/Projects/Devs/dsh-plugins/plugins/workspace-shell`
     （DeepBuddy 文件树消费它的 `workspaceShell/*` 端点；tiny-window 不要装）
   - `dsh --profile deepbuddy --dump-config` 能看到两个插件 bundle 层。
6. **起服务冒烟**：3080 被 web profile 占用，用 3081：
   `dsh --profile deepbuddy web --port 3081`（先 `dsh web --help` 确认 port flag 写法）。
   验证：`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3081` 为 200，
   且 `curl -s http://127.0.0.1:3081/plugins/deepbuddy/client.js | head -c 200` 能看到
   ModuleLoader 头。验证完把服务留着运行（后续视觉验收要用）。
7. **Electron 壳**：`apps/desktop/main.js` 已在本 repo。改两处：
   `backgroundColor` 改 `'#fafaf9'`；文件头注释与 `DSH_WEB_URL` 默认值说明改为指向
   `dsh --profile deepbuddy web`（默认 URL 保持 127.0.0.1:3080，注释说明发行版 profile）。
   `apps/desktop/README.md` 同步。
8. **根 README.md**（中文）：写发行版定位——三层结构（官方 dsh core+web 插件锁版本 /
   DeepBuddy UI 插件 / Electron 壳）、安装步骤（第 5 步的命令）、开发命令（第 4 步）、
   升级官方版本 = bump `0.1.0-rc.*` 依赖 + 重跑测试。简洁，不写营销话术。

## 汇报格式

结论先行：每步命令 + 实际输出摘要（成功/失败），改动文件清单，遗留问题。
把同样内容写进 `~/Desktop/Projects/Devs/deepbuddy/.agents/handoffs/2026-08-17-phase1-migration.md`。
