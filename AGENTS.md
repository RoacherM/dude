# AGENTS.md — DeepBuddy 开发约束

在修改 DeepBuddy 前，按顺序阅读：

1. `deepbuddy-design-current/ARCHITECTURE.md`
2. `deepbuddy-design-current/DESIGN_INTENT.md`
3. `deepbuddy-design-current/DEVELOPMENT_RULES.md`
4. `deepbuddy-design-current/FEATURE_MAP.md`

## Current-State Principle

Treat the latest accepted requirements, design decisions, and implementation state as
the source of truth. New decisions supersede earlier versions rather than accumulating
with them. Plans, designs, code, documentation, comments, and summaries should describe
the current intended state directly; include historical context only when necessary to
explain constraints, compatibility, migration, or important trade-offs.

## 项目定位

DeepBuddy 是 DeepSeek Harness 的精选 Electron 客户端。

- DSH 负责领域能力和数据。
- DeepBuddy 负责三列两区 UI。
- 当前是模块化单体，不是公共 UI 插件平台。
- 不实现动态 UI 插件、Placement DSL、`when` DSL 或 Manifest，除非任务明确要求且已满足抽象触发条件。

## 绝对约束

1. 主列永远存在；左右列可收起；不增加第四列或自由浮窗。
2. Shell 只管布局、Selection、Inspector View 实例和窗口级 Overlay。
3. Shell 不写 Session、Files、Terminal 等业务分支。
4. DSH 具体 ABI 只在 `renderer/dsh/` Adapter 层出现。
5. Feature 不深度导入其他 Feature 的内部文件。
6. 每份可变状态只有一个 Owner；不要用 Effect 同步两份状态。
7. 普通页面使用静态 Catalog，不建立动态 Registry。
8. 同类需求出现第三个实例之前，不抽公共框架。
9. 局部点击默认用组件事件；需要快捷键、跨模块调用或多处投影时才建立 Command。
10. 只有 Terminal、Browser、Editor 等真实资源模块区分 View 与 Resource。
11. 所有 Listener、Timer、Watcher、IPC Subscription 必须清理。
12. 普通 UI 使用 KIT 和 Token；不注入全局 CSS，不覆盖主题。
13. Renderer 不直接使用 Node / Electron 主进程 API。
14. 不修改或复制 DSH 的领域逻辑；优先消费公开 Service、Event 和现有领域 Slot。

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

- 三列两区；状态栏当前基线 52px。
- 左列默认 268px；右列默认 46%；窄屏右先左后收起。
- Workbench 页面：Conversation、Settings。
- Sidebar：Session List、Settings 入口。
- Inspector：Files、File Preview、Terminal。
- Settings 只替换主列，左右列保持原状态。
- 收起右列或切 Tab 不得终止 Terminal。
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
