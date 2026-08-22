# DeepBuddy 用自己设计的 UI；官方 UI 只作"基础能力如何对齐"的参考，不复用不改造其组件

- 日期 / agent：2026-08-17 / claude
- 我原来的理解（上一轮方案）："换框不换芯"——deepbuddy-frame 顶替 ui-layout 声明官方四子槽，让官方 ui-sidebar / ui-conversation 等 occupants 渲染进 DeepBuddy chrome，再用 theme tokens 给官方组件换肤。
- 用户实际要的：
  1. **UI 用我们自己设计的那套**（v2 像素设计的自绘界面），不需要修改/换肤官方 UI；
  2. 官方 webui 对整合的意义是**参考**：读它的源码搞清楚基础能力走哪些服务/端点（agentPresets、plugin inventory、interaction/审批、models、trajectory…），然后把这些能力**用 DeepBuddy 自己的组件**接进来；
  3. 这类实现活用 herdr 派 opus/sonnet 子代理干，fable 只做架构与验收。
- 分歧根源：范围假设——把"整合官方基础能力"理解成"复用官方组件渲染"，实际是"对齐官方数据面/服务面，UI 自绘"。
- 以后如何避免：涉及"整合官方能力"时先问清楚整合的层面：**服务/数据层对齐**（自绘 UI 消费同一批服务）还是**组件层复用**（官方组件进驻）。默认前者，除非用户明说要官方界面。

技术落点（修正后架构）：
- 组合机制回到 **root shadow priority -1**（官方 ui-layout 行保持启用、占用者保持注册但不渲染，服务全部存活）；deepbuddy profile 中 DeepBuddy 即唯一 UI，不做切换书签。
- ui-layout 禁用 + 子槽重声明的方案作废（那是组件层复用的机制）。
- 基础能力对齐清单（都以官方 ui-* 源码为参考、DeepBuddy 组件实现）：
  - 四种模式：`ctx.agentPresets`（list/resolve、空白会话切换、`agent-preset/selected`）+ 创造模式；
  - 插件入口：plugin-inventory RPC + settings 面（自创作/变更/删除）；
  - 审批/提问：interaction / user-questions 服务；
  - 模型选择：session.models；Trajectory / 统计条：对应 projection。
- 发行版定位不变：新 repo deepbuddy、官方包锁版本零修改、Electron 只是壳。
