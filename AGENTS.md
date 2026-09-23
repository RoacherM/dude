# AGENTS.md — DeepBuddy 开发约束

在修改 DeepBuddy 前，按顺序阅读：

1. `design/ARCHITECTURE.md`
2. `design/DESIGN_INTENT.md`
3. `design/DEVELOPMENT_RULES.md`
4. `design/FEATURE_MAP.md`

涉及 UI/交互的改动，另读 `design/prototype/README.md`：
原型是现行 UI 设计基线，改动先在原型上迭代验收，再落到实现；
实现与原型不一致时以最新验收过的原型为准。

## Current-State Principle

Treat the latest accepted requirements, design decisions, and implementation state as
the source of truth. New decisions supersede earlier versions rather than accumulating
with them. Plans, designs, code, documentation, comments, and summaries should describe
the current intended state directly; include historical context only when necessary to
explain constraints, compatibility, migration, or important trade-offs.

## 项目定位

DeepBuddy 是 DeepSeek Harness 的精选 Electron 客户端（执行“官方优先、最小侵入”的 Thin Shell 策略）。

- DSH 负责领域能力、数据、官方应用布局（AppFrame）、侧边栏导航与核心会话交互。
- DeepBuddy 负责桌面原生集成、Inspector 增强（Terminal / Browser 等多 Tab 资源工具）与主题 Token 优化。
- 坚持“官方能做的优先用官方”，避免重复实现侧边栏、标题栏与布局外壳造成冗余割裂。
- 当前是模块化单体桌面应用，不是公共 UI 插件平台。
- 不实现动态 UI 插件、Placement DSL、`when` DSL 或 Manifest。

## 绝对约束

1. 官方优先（Official-First）：优先使用 DSH 官方布局、官方侧栏与公开 Slot；不造平行外壳与冗余侧栏。
2. 最小侵入（Minimal-Invasiveness）：不覆写易碎的内部 private ABI，不注入破坏性 CSS 类名隐藏官方组件，保障上游快速升级零破损。
3. 主列与右栏：主列运行官方会话核心；右列作为 Inspector 增强（Terminal、Browser、Files 预览）通过官方 rightbar / slot 对齐。
4. Shell 职责单一：只管桌面窗口生命周期、Selection 与 Inspector 资源实例挂载。
5. DSH 具体 ABI 只在 `renderer/dsh/` Adapter 层出现。
6. Feature 不深度导入其他 Feature 的内部文件。
7. 每份可变状态只有一个 Owner；不要用 Effect 同步两份状态。
8. 普通页面使用静态 Catalog，不建立动态 Registry。
9. 同类需求出现第三个实例之前，不抽公共框架。
10. 局部点击默认用组件事件；需要快捷键、跨模块调用或多处投影时才建立 Command。
11. 只有 Terminal、Browser 等真实资源模块区分 View 与 Resource（收起右列或切 Tab 不得终止 Terminal 进程）。
12. 所有 Listener、Timer、Watcher、IPC Subscription 必须清理。
13. 普通 UI 使用 KIT 和 Token；以 CSS 变量与主题体系为主，不注入全局破坏性样式。
14. Renderer 不直接使用 Node / Electron 主进程 API。
15. 不修改或复制 DSH 的领域逻辑；优先消费公开 Service、Event 和现有领域 Slot。

## 默认实现路径

新增普通功能：

```text
features/<name>/
→ 导出薄 Definition
→ 加入 app/catalog.ts
→ 使用 dsh-adapter
→ 补 Loading / Empty / Error
→ 写测试
```

不要先创建：

- `registerXxx()` 公共 API；
- 插件 Manifest；
- API Version；
- Placement / Context Key；
- Provider / Consumer 三件套，除非已有多个真实实现和消费者。

## UI 基线

- 官方优先的布局体系：主列为官方会话流，左侧为官方原生侧边栏，右侧为增强 Inspector。
- 去除多余外壳：避免在外层重复包装侧边栏与标题栏，贴合窗口满屏平铺。
- Sidebar：直接消费官方 Workspace / Session / Settings 导航，不加冗余顶框。
- Inspector：挂载在右栏，承载 Terminal、Browser、Files 预览等原生资源能力。
- 收起右列或切 Tab 不得终止 Terminal 进程。
- 最后一个 Inspector View 关闭后可自动收起右列。

## 提交前检查

- [ ] 是否在猜未来，而不是解决第三个真实实例？
- [ ] Shell 是否出现了 Feature ID 业务分支？
- [ ] 是否复制了 DSH 数据？
- [ ] 状态 Owner 是否唯一？
- [ ] 是否能删除新抽象并让代码更简单？
- [ ] Effect 是否全部清理？
- [ ] 是否使用 KIT / Token？
- [ ] 是否覆盖 Loading / Empty / Error？
- [ ] 四种布局状态是否仍可用？
- [ ] Terminal 资源生命周期是否正确？
