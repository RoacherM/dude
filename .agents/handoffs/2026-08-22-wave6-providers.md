# wave6 boot 报错清理 + 模型 Provider 功能 handoff

- 日期 / agent：2026-08-22 / claude
- 目标：清除启动 "Failed to load plugins" toast（A），并在设置面板与 composer 中落地模型 Provider 管理（B）。
- git 基线：`4e3b519`。**未 commit**。

## A. boot 报错清理（完成，实测无 toast）

### 根因
`plugins/deepbuddy/cordis.patch.yml` 只 disable 了 `ui-layout`，但 web 客户端 boot 清单里
`ui-sidebar` / `ui-conversation` 两行 inject 的 module 依赖就是
`@deepseek-ai/dsh-client-ui-layout`；该行已出图，这两行永远 pending，激活审计
（`dsh-web-frontend` `assertEntriesActive`，cordis `fiber.inject` 服务名 `layout`）
报 `pending (waiting for service: layout)`。

### 改动
- `plugins/deepbuddy/cordis.patch.yml`：新增 `- id: ui-sidebar` 与 `- id: ui-conversation`
  两行 `disabled: true`（与现有 `ui-layout` 同款 id 写法；确认过 `--dump-config` 的
  row id 就是这三个）。
- **死代码清理（查证结论：`layout` 服务的 cordis 消费方只有 ui-sidebar / ui-conversation，两者已禁用）**：
  - `dsh/adapter.ts`：移除 `OCCUPANT_SHADOW_PRIORITY` 导出与「影子优先级」注释；
    移除 `ctx.reflect.provide('layout', layout.layoutFace() as ILayout)` 与 `ILayout` type import。
  - `client/app/App.tsx`：移除 `OCCUPANT_SHADOW_PRIORITY` import 与 sidebar/conversation
    register 的 `priority`，默认 0 即可（官方行已禁用，无其它占用者）。
  - `shell/layout-store.ts`：移除 `ILayout` import、`layoutFace()` 方法、「official face」段注释；
    `detailsOpen` 字段保留（ThreeColumnFrame 仍读它定宽），但其注释改为「无 consumer，恒关闭」。
  - `README.md` / `cordis.patch.yml` 注释：把「官方占用者保持注册只是不渲染」的
    影子叙事改成「三个官方行被禁用」。

### 查证要点（列在汇报里）
- `layout` 服务在全部官方 client bundle 的 cordis `inject` 消费方严格只有
  `@deepseek-ai/dsh-client-ui-sidebar` 与 `@deepseek-ai/dsh-client-ui-conversation`；
  其它包的 `"layout"` 命中只是 CSS / 文档字符串。两者已禁用 → 删 provide 安全。
  `dsh-cordis-client-runner` 只在嵌入文档里提及 `ctx.layout`，不是 inject。
- 客户端 manifest（`__DSH_BOOT__`）的 `inject` 数组是 module-graph 排序依赖
  (`dsh.client.inject`，包名），不是 cordis 服务依赖；`processOne` 跳过 `disabled`
  行（`!entry.disabled`），所以禁用三行后 manifest 从 42 → 40 entries，且无残留引用。
  其它官方行把 `ui-conversation`/`ui-sidebar` 列为模块依赖的只是排序 no-op（`dependency !== void 0` guard）。
- 历史 cordis 插件（flappy-1 / term-1 等）在 `~/.dsh` 无持久化残留（确认），无需清理。

### 验收（全绿）
- `dsh --profile deepbuddy --port 3082` 启动，浏览器加载：**无 "did not activate" toast**，
  无 `[data-slot-error]`，root 正常渲染（会话列表可见）。
- `__DSH_BOOT__` `entries` 42 → 40（ui-layout / ui-sidebar / ui-conversation 三行 ABSENT，
  deepbuddy PRESENT）。
- 测试：deepbuddy 59 条全绿（含重写的 `the bundle patch disables the frame and column rows`
  与 `seats its own columns without a shadow priority`）。

## B. 模型 Provider 管理（完成，实测生效）

### 官方实现研读（node_modules 锁 0.1.1-rc.2）
- `@deepseek-ai/dsh-client-ui-settings-models`：设置「模型」页。wire 走 `connection.api` 的
  `llm.providers` / `llm.models` / `llm.discoverModels`、`credentials.describe|set|unset`、
  `settings.mutate`（ns = `ConfigurableProviderView.settingsNs`，path = `settingsPath`）。
- `@deepseek-ai/dsh-client-ui-model-selection`：composer 模型选择器。wire 走 `sessions.models({sessionId})`
  与 `sessions.selectModel({sessionId, provider, model, reasoningEffort})`。
- `@deepseek-ai/dsh-agent-default-model`：settings 命名空间 `agent-default-model`，
  形状 `{provider, model, reasoningEffort}`；保存用 `settings.replace`。
- `@deepseek-ai/dsh-credentials(-local)`：`~/.dsh/.credentials.yaml`，refs + env 键名（如 `DEEPSEEK_API_KEY`）。

### 改动
- **新增 `dsh/models.ts`**（wire + plane）：
  - `ModelsWire`：`listProviders` / `listModels` / `defaultModel` / `setDefaultModel` /
    `describeCredential` / `setCredential` / `providerProfile` / `settingsWritable` /
    `sessionModels` / `selectSessionModel`，全部 `unary()` 折叠成 `ModelResult<T>`。
  - `ModelsPlane`（每 fiber 一份，接 `Dsh`）：settings 页的 `load`（providers + catalog +
    default + writable + 每 provider 凭据存在性）、`saveDefault`、`saveCredential`；
    composer 的按 session 目录 `sessionState` / `loadSession` / `selectSession` / `disposeSession`。
- **适配层接线**：`dsh/adapter.ts` `Dsh` 增加 `models: ModelsWire`，`createDsh` 里
  `models: createModelsWire(connection.api)`。`app/context.tsx` `AppDeps` 增加 `models: ModelsPlane`；
  `app/App.tsx` 实例化 `new ModelsPlane(dsh)` 并塞进 `deps`。
- **设置面板「模型」页**：新增 `features/settings/ModelsPage.tsx`，放入 `SETTINGS_PAGES` 最前
  （模型 / 模式 / 插件，官方顺序），`features/settings/index.ts` 导出。
  - provider 卡片：displayName + id + 已启用/未启用 badge + 模型列表（含「支持推理档位」标记）；
  - 凭据：无 keyRef 则无字段；有 keyRef 只显示「已配置 / 未配置」存在性，输入框 `type=password`，
    保存走 `credentials.set`，**从不回显**（页面/主机都只回 configured 状态）；
  - baseURL：profile 里有就显示（Mono）。
  - 默认模型 picker：provider → model → 推理档位 三连 Select + 保存，写 `agent-default-model`。
  - Loading（「加载模型清单…」）/ Empty（没有可配置 provider）/ Error（Failure 红线）三态齐备。
- **composer 模型 chip**：`features/conversation/Chat.tsx` 新增 `ModelChip`，
  渲染在 WorkspaceChip 与 ModeChip 之间（KIT：Select pill）。打开时 `models.loadSession`，
  `onChange` 走 `models.selectSession`。**中途换模型：官方支持** —— `sessions.selectModel`
  host handler 直接 `selectionFor(agent).current = selected`（并同步写默认模型）。

### 验收（浏览器实测，端口 3082，1440×900）
- 设置 → 模型：provider 列表（deepseek-official 已启用+已配置；amazon-bedrock / ant-ling /
  anthropic / azure-openai-responses 等未启用）；模型列表（DeepSeek-V4-Flash / -Pro /
  -Flash-Vision-Exp 各带「支持推理档位」）；**无 `sk-` 值回显**（`hasKey:false`，只显示「已配置」）。
- **composer 模型选择实际生效**：在 composer chip 选 `DeepSeek-V4-Flash` 后，
  `~/.dsh/settings.yaml` 的 `agent-default-model.model` 从 `deepseek-v4-pro` → `deepseek-v4-flash`
  （host `sessions.selectModel` 落地），chip 文本同步变为 `DeepSeek-V4-Flash`。
  随后在设置「默认模型」pick 回 `DeepSeek-V4-Pro` 并保存 → settings.yaml 复原为
  `deepseek-v4-pro`（`settings.replace` 生效）。
- **Part A 在 B 改动后仍成立**：最终 bundle 重启，无 toast、无 slot error。

## 验证（全绿）

```sh
pnpm build && pnpm typecheck && pnpm test
# deepbuddy 59 条全绿（新增 7 条：models wire×5 + settings Models nav + composer ModelChip）
# terminal-probe 5 条全绿。
```

浏览器实测：boot toast 消失、设置模型页、composer 模型选择生效、无 API key 回显 四项全部通过。

## 关键决策/约束

- **禁用而非 shadow outrank**：ui-sidebar / ui-conversation 注入的 `layout` 服务随 ui-layout
  一起消失，永远无法激活 —— shadow 优先级叙事已不成立，改为直接禁用三行。这同时清掉了
  启动 toast，并让 client manifest 少两行。
- **`layout` provide 删除取决于「无 cordis consumer」**：查证结论是 consumer 只有这两个
  已禁用行，故删除安全；`detailsOpen` 字段保留（ThreeColumnFrame 只读它，不写它也恒关闭）。
- **模型 wire 全走官方通道**：列 provider 用 `llm.providers`，模型目录用 `llm.models`，
  会话选择用 `sessions.models`/`sessions.selectModel`，凭据用 `credentials.describe|set`，
  默认模型用 `settings.replace`（agent-default-model）。DSH ABI 只进 `dsh/models.ts`，
  Feature 读 `ModelsWire` / `ModelsPlane`。
- **API key 明文纪律**：`credentials.describe` 永远返回 `configured/source/writable`（无值）；
  明文只在 `credentials.set` 单向上行；React state 里只有输入框的临时 draft。
- **中途换模型依据**：`sessions.selectModel` host handler 直接改动会话 agent 的
  `selectionFor(agent).current`（非 blank-only gate），所以 composer chip 对已开始会话同样可选。
  （依据：`dsh-host-apiproxy/lib/index.js` `async selectModel(request)` —— resolveCallConfig →
  `selectionFor(found.agent).current = selected` → `saveDefaultModelSelection?.(selected)`。）
- **`providerProfile` 读 `settings.describe` 红action后按 `settingsPath` 走**：deepseek-official
  settingsPath=[]，即读整个 `llm-deepseek` namespace 的 value，取 `apiKeyEnv`/`baseURL`。
- 端口：验证服务用 3082，**未动 3081/3086**（确认仍 LISTEN）。

## 复测入口

```sh
node_modules/.bin/dsh --profile deepbuddy --port 3082 --no-open   # 浏览器 http://127.0.0.1:3082
pnpm --filter dsh-plugin-deepbuddy build && pnpm --filter dsh-plugin-deepbuddy test
# 模型选择生效证据：composer chip 换模型后 cat ~/.dsh/settings.yaml 的 agent-default-model.model。
```

## 未完成 / 下一步

- 无阻塞项。`reports/restructure/` 是既有未跟踪目录，非本波产物。
- 可选后续：settings 模型页对「custom provider 创建」暂未提供（官方有 CustomProviderCard +
  `llm.discoverModels`）；当前实现聚焦「列 provider / 模型 / 默认模型 / 凭据设置」这个验收面。
