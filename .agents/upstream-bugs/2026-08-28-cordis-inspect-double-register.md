# dsh 上游 bug：cordis 预设二次挂载撞车 process-global inspect registry

- 日期 / 发现者：2026-08-28 / claude（DeepBuddy 真机会话 resume 报错）
- 状态：未修复（上游问题，DeepBuddy 侧未打补丁）

## 症状

会话 resume 弹错误 toast：

```
模型操作失败: internal: resume failed for session "session-…":
Error: agent-presets: preset "cordis" failed to mount:
failed to apply loader entry tool-cordis (@deepseek-ai/dsh-tool-cordis):
Host Cordis inspect provider "Service" is already registered
(…/dsh-runtime/node_modules/@deepseek-ai/dsh/config/agent-presets/cordis/agent.cordis.yml)
```

## 根因链（全在 @deepseek-ai 官方包内）

1. `agent-presets` 装载器**按会话**挂载 cordis 预设（`agent.cordis.yml`
   的 loader entry `tool-cordis`），会话启动/resume 各执行一次。
2. `tool-cordis` 的 `apply()` 注册 4 个 host inspect provider
   （Service / Event / Builtin / Tool）到 `ctx.cordisInspect`：
   `dsh-tool-cordis/lib/index.js`（apply 段，`hostInspectProviders`）。
3. `CordisInspectRegistryService` 是 **process-global**（注释原文
   "Register the process-global Host registry"）：
   `dsh-cordis-host-runner/lib/index.js:721`。
4. `register()` 对重复 id 直接 throw 而非幂等：
   `dsh-cordis-host-runner/lib/types/inspect-registry.js:23`。

进程级注册表 × 会话级挂载 ⇒ 第二个挂 cordis 预设的会话（或旧 fiber
未析构干净时的 resume）必然 mount 失败。

## 触发条件与规避

- 触发：两个会话并行使用 cordis 预设；或 resume 时上一个 fiber 仍持有注册。
- 规避：重启 app（进程重启清空注册表）后首个会话正常；避免多会话并行用 cordis。

## 建议的上游修法（三选一）

1. `tool-cordis` 把进程级 provider 的注册挂 host root fiber，做一次性注册；
2. registry 按 session 维度隔离 key；
3. `register()` 对同 id 引用计数（首注册生效、末释放删除）。

## DeepBuddy 侧决策

按 ARCHITECTURE.md §4（不 fork/改官方包，`cordis.patch.yml` 只动 roster）
不做本地补丁。若急需可用 `pnpm patch` 给 runtime 加引用计数兜底——需要
用户明确拍板后再做。

## 复现入口

同一 DeepBuddy 进程内起两个使用 cordis 预设的会话，或对已挂载过 cordis
的会话做 resume；观察第二次 mount 时的错误 toast。
