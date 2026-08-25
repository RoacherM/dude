# DeepBuddy 当前设计文档

> 状态：**现行，可直接据此开发**  
> 更新：2026-08-21

DeepBuddy 是 DeepSeek Harness 的精选 Electron 客户端。

- DSH 负责 Agent、Session、Tool、模型、文件系统、审批和沙箱等能力。
- DeepBuddy 负责三列两区的桌面界面与第一方功能体验。
- 当前采用**模块化单体 + 静态组合**，不建设公开的 UI 插件平台。
- 第一方模块可以在实现上使用 Cordis/DSH 生命周期，但这不等于向外承诺动态 UI 插件 API。

## 文档效力

按以下顺序理解当前设计：

| 文件 | 用途 | 约束力 |
|---|---|---|
| [`../AGENTS.md`](../AGENTS.md) | Coding Agent 开工约束与提交检查（在仓库根） | 执行入口 |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 系统边界、模块关系、DSH 集成方式 | 最高 |
| [`DESIGN_INTENT.md`](./DESIGN_INTENT.md) | 三列两区、交互与视觉基线 | 高 |
| [`DEVELOPMENT_RULES.md`](./DEVELOPMENT_RULES.md) | 开发时必须遵守的工程约束与检查表 | 高 |
| [`prototype/`](./prototype/README.md) | 高保真可交互原型；**UI/交互改动先在此迭代再落实现** | UI 基线 |
| [`FEATURE_MAP.md`](./FEATURE_MAP.md) | v1 功能落点、状态 Owner、开发顺序 | 当前计划 |
| [`design/minimal-icons.html`](./design/minimal-icons.html) | 当前最小 UI 的浏览器配图 | 视觉参考 |
| [`notes/UI_EXTENSION_TRIGGERS.md`](./notes/UI_EXTENSION_TRIGGERS.md) | 未来何时才抽取 UI 扩展协议 | 决策备忘 |

发生冲突时，以靠前文件为准。

## 当前一句话

> **三列两区保持严格，具体功能默认直接组合；重复三次或出现外部作者后，再从真实代码中抽取扩展协议。**

## 当前不做

下面这些不是 v1 的基础设施：

- 动态安装和卸载 UI 插件；
- 面向第三方的 `register / declare / surface` 公共协议；
- Placement、`when`、Context Key 等全局 UI DSL；
- 任意面板、自由浮窗、任意 Webview；
- 插件市场和运行时 UI 热插拔；
- 为每个局部点击动作建立全局 Command；
- 为每个普通页面建立 View / Resource / Plugin 三重生命周期。

它们并非永远禁止，只是必须等真实需求出现后再提炼。

## 开工顺序

1. 搭 `ThreeColumnFrame` 和统一 `ColumnFrame`。
2. 建 `dsh-adapter`，把官方数据投影为稳定前端接口。
3. 跑通 Session List + Conversation。
4. 将 Settings 做成主列普通页面。
5. 加 Files Inspector View。
6. 加 Terminal View 与独立 Resource Manager。
7. 最后再评估是否出现了值得抽象的第三个同类需求。
