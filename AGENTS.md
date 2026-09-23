# AGENTS.md — Dude 开发约束

在修改 Dude 前，按顺序阅读：

1. `design/ARCHITECTURE.md`
2. `design/DESIGN_INTENT.md`
3. `design/DEVELOPMENT_RULES.md`
4. `design/FEATURE_MAP.md`

`design/prototype/` 是历史视觉参考，不是 UI 基线：界面全部是官方的，Dude 没有自绘
UI 需要先在原型上验证。

## Current-State Principle

Treat the latest accepted requirements, design decisions, and implementation state as
the source of truth. New decisions supersede earlier versions rather than accumulating
with them. Plans, designs, code, documentation, comments, and summaries should describe
the current intended state directly; include historical context only when necessary to
explain constraints, compatibility, migration, or important trade-offs.

## 项目定位

Dude 是 DeepSeek Harness（dsh）的桌面发行版：官方 `dsh-web-app` 界面原样跑在
Electron 窗口里。

- DSH 负责领域能力、数据、窗口布局（`ui-layout`）、左右两侧栏与会话交互。
- Dude 插件只加一样官方没有的东西：窗口拖拽区域（含红绿灯避让）的样式表。Hero 用官方
  鲸鱼标记。`src/host.js` 是空实现。
- Electron 壳只管窗口和 dsh 进程启停；没有 Preload、IPC 或原生菜单。
- 官方缺的能力（例如锁定版本的右栏没有终端和浏览器）是能力缺口，靠升级官方版本补，
  不自绘平行实现。
- 不做公共 UI 插件平台：不实现动态 UI 插件、Placement DSL、`when` DSL 或 Manifest。

## 绝对约束

1. 官方优先：用官方布局、官方侧栏和公开 Slot；不造平行外壳、侧栏或右栏。
2. 最小侵入：不覆写官方内部 private ABI；不用 CSS 隐藏官方组件；选择器定位官方
   `data-*` 属性或语义元素，不用 hash 化的 class 名。
3. `cordis.patch.yml` 只 insert `dude` 一行，不禁用任何官方行；不注册 `root`，
   不提供第二份 `layout`。
4. DSH ABI 只在 `plugins/dude/src/client/dsh/` 出现。
5. 每份可变状态只有一个 Owner；不要用 Effect 同步两份状态。
6. 所有 Listener、Timer、Watcher、Subscription 必须清理；插件的每项注册都包在
   `ctx.effect` 里。
7. 同类需求出现第三个真实实例之前，不抽公共框架。
8. Renderer 不直接使用 Node / Electron 主进程 API。
9. 不修改或复制 DSH 的领域逻辑；优先消费公开 Service、Event 和现有领域 Slot。

## 提交前检查

- [ ] 官方是否已经有这个能力？
- [ ] 是否依赖了官方私有 ABI 或 hash 化 class 名？
- [ ] `cordis.patch.yml` 是否仍只 insert 一行？
- [ ] 状态 Owner 是否唯一？
- [ ] Effect 是否全部清理（卸载插件后回到纯官方界面）？
- [ ] 是否能删除新抽象并让代码更简单？
- [ ] 拖拽区域是否挡住官方控件？在左栏展开 / 收起、右栏全屏几种状态下各点一遍。
- [ ] `pnpm test` 是否通过？
