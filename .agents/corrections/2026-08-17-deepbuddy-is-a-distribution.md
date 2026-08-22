# DeepBuddy 是 dsh 的桌面发行版，不是 dsh-plugins 里的一个插件；一套 UI 组合官方能力，不做模版切换

- 日期 / agent：2026-08-17 / claude
- 我原来的理解：DeepBuddy = dsh-plugins 仓库里的一个 UI 插件，用 root shadow 整体替换官方 shell，后来又做成"官方 UI ↔ DeepBuddy"两套模版互切。
- 用户实际要的：
  1. 产品形态是 **dsh 的桌面发行版**（命名 dsh-desktop 或 deepbuddy），放**新 repo**，不放 dsh-plugins；
  2. **不改 dsh 底层逻辑**——官方 core + webui 插件全部原封引用，升级 = bump 依赖版本，保证能持续同步官方新功能；
  3. **一套 UI**：DeepBuddy 外观与官方 webui 基础能力（审批、四种模式、插件自创作入口、Trajectory、模型选择…）组合在同一界面里，不是切换模版；
  4. 保留内置四种模式（标准/PTC/极简/创造），尤其创造模式与插件入口——桌面版要像 webui 一样能自己创作/变更/删除插件；
  5. Electron 只是壳。
- 分歧根源：范围假设——把"以插件机制实现"外推成"产品就是一个插件"；把"保留官方界面"实现成"两套 shell 切换"而不是"同一界面组合"。
- 以后如何避免：先分清**实现机制**（dsh 插件 API 是唯一零底座扩展点）与**产品形态**（发行版）；凡替换官方 surface，优先方案是"重声明官方同名子插槽让官方 occupants 渲染进来"，从框架层复用而不是从功能层重写。

技术锚点（已核实）：
- 四种模式 = agent presets，位于 dsh 仓 `apps/cli/config/agent-presets/{standard,code,minimal,cordis}`（标准/PTC/极简/创造），`ctx.agentPresets` 提供 list/resolve/copy/remove/recompose（空白会话才可切，gateway 强制 `agent-preset-locked`）；创造模式自带 preset 创作 skills。
- 官方 `ui-layout` 注册 root 时以 `children:` 声明四个子插槽 `sidebar / conversation / details / shell.overlay`；占用者：ui-sidebar（内部再声明 workspace/settings seats）、ui-conversation（session body/composer/input seats + DetailsPanel 的 tool-details seat）。**任何 root 注册者都可重新声明同名 children，官方 occupants 即渲染进新框架**——这是"换框不换芯"的机制基础。
- 插件管理界面 = `ui-settings-plugins` + `ui-settings-plugin-inventory`；主题层 = `ctx.theme` + ThemePresenter（投影到 document.body）。
