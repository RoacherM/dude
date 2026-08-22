# 官方接口变更盘点：0.1.0-rc.6 → 0.1.1-rc.2

> 方法：`npm pack` 拉取 7 个直接依赖包的 0.1.1-rc.2，与本地 node_modules 里的
> rc.6 逐包 diff `.d.ts`；bundle 组成用 `npm view <pkg>@<ver> dependencies` 对比。
> 结论先行：**对 DeepBuddy 插件当前代码零破坏**，可直接 `--apply` 升级。

## 对我们有实际影响的变更

| 变更 | 位置 | 对 DeepBuddy 的影响 |
|---|---|---|
| `prompt()` 新增可选参数 `signal?: AbortSignal` | `dsh-client-runtime` `contract/session.d.ts` / `sessions/session.d.ts` | 无破坏；后续 Composer 的停止可改用 AbortSignal，属增强 |
| 转发事件重命名 `credentials/updated` → `credentials/reference-updated` | `dsh-api-remotes` `remote-events.d.ts` | 我们未消费该事件（已 grep 确认），无影响 |
| `injectBootTheme(html)` 删除，改为 `bootThemeInjection(): IndexInjection` | `dsh-client-ui-theme` `boot-theme.d.ts` | Host 侧 API，我们未调用；新增 `client/styles.d.ts` 的 `installThemeStyles(ctx)` 值得关注（我们的 `theme.ts` 钉死 dark 的补丁逻辑升级后需目检一遍） |
| 官方渲染器抽包：注释中 `web-react` 全部改为 `ui-renderer`，web-app 新增依赖 `dsh-client-ui-renderer` | `dsh-client-ui-slots` / `dsh-client-runtime` 多处 | 仅内部重组；`SlotRenderer` 契约本身未变，我们接管 root slot 的方式不受影响 |
| `createWebConnectionRpc(doFetch?)` 新增传输覆盖参数；新增 `ClientTransportHooks`（页面全局可装自定义 carrier：`createApiClient` / `fetch` / `loadBundle?`） | `dsh-client-connection` `client/rpc.d.ts` / `client/index.d.ts` | 无破坏。**对 Electron 壳是利好**：将来壳可以走自有传输而不必依赖 HTTP 服务页面 |
| conversation 节点语义精化：aborted turn 的 frozen partial 现在区分「durable finalized prefix（用事件 seq）」和「chunk-only fallback（用分数 seq）」；terminal failure 节点与 retry chain 分离渲染 | `dsh-client-runtime` `sessions/conversation.d.ts` | 类型形状兼容，但 `store.ts`/`dsh.ts` 的节点折叠逻辑升级后要跑一遍真实会话验证；**可能与 M1 handoff 记录的「某会话 nodes.length===0」现象相关** |
| 新增工具函数 `abbreviateHomePath(path, home?)`、`sessionRecallLabels(source)` | `dsh-client-runtime` `workspaces/path.d.ts` / `sessions/context-provenance.d.ts` | 纯新增；Files/路径显示可直接复用，不必自己写 `~` 缩写 |
| http-bridge 图片上限 100 MiB → 200 MiB | `dsh-client-connection` `http-bridge.d.ts` | 无影响 |
| `host.describe` 新增 account home 字段 | `dsh-client-connection` `client/index.d.ts` | 纯新增 |

## bundle 组成变化（web-app 新增的官方插件）

新增：`dsh-client-ui-renderer`（渲染器抽包）、`dsh-client-ui-attachment`、
`dsh-client-ui-brand-official`、`dsh-client-ui-reference`、
`dsh-file-reference(-local)`、`dsh-session-reference`、`dsh-launch-environment`、
`dsh-subprocess`、npm `open`。无移除。
含义：官方新增了**附件、@文件引用、@会话引用**三块能力面。DeepBuddy 的
Composer/Conversation 要不要跟进这三个能力，进 FEATURE_MAP 待办（不影响本次升级）。

`dsh-base`（host 侧）：组成无增删，仅版本齐涨。

## 我们的 ABI 接触面（grep `plugins/deepbuddy/src`）

`dsh-client-ui-slots`(6) / `dsh-client-ui-layout/client`(3) / `dsh-client-runtime/client`(3) /
`dsh-client-connection/client`(2) / `dsh-client-ui-theme/client`(1) / `dsh-api-remotes/client`(1) /
`schemastery`(1)。`dsh-client-ui-layout` 的类型零变更；其余变更点均未被我们引用。

## 升级结果（同日执行完毕）

**插件侧零源码改动**：bump 10 处钉版本 + 重生成 pnpm-lock，
build / typecheck / test（45+5 条）/ 冒烟 4 项全绿。

过程中吃到的两个坑，均已修进仓库：

1. **陈旧 lockfile 会劈裂类型图**。首跑 `--apply` typecheck 红（8 个错：
   `$on` 事件键成 `never`、`pluginInventory` 不在 `TypertClientRemote` 上）。
   根因不是代码：新版 `dsh-api-remotes` 把类型增补来源包从 dependencies 挪成
   peerDependencies，pnpm 增量 install 用 lock 里残留的 rc.6 条目去满足新包的
   `^0.1.1-rc.2` peer 范围（带 WARN 不带错），rc.6/rc.2 两个世界在 `.pnpm` 里
   并存，augmentation 打不到同一份模块实例。删 lock 重装后零错。
   修复：`sync-upstream.mjs` 的 bump 现在快照后直接删 lock，强制整锁重解析。
2. **runtime 版本原先不在仓库锁定**。server 侧（dsh core + 官方 web 插件）
   全部来自 dsh CLI 本体，而它躺在 npx 缓存里（rc.6）。
   修复：`@deepseek-ai/dsh` 钉进根 package.json devDependencies，
   `resolveDsh()` 优先用 `node_modules/.bin/dsh`，bump 清单纳入根 manifest。
   另：新版 index 把 boot 清单写成 `globalThis["__DSH_BOOT__"]`，
   冒烟正则已从 `window.` 写法放宽为匹配赋值本身。

**遗留人工步骤**：README 规定升级绿后须过 DESIGN_INTENT §14 视觉验收清单，
重点目检：暗色主题补丁（theme.ts，上游 theme 包新增 `installThemeStyles`）、
aborted turn 的「已停止」节点（conversation 语义精化）、
此前 nodes.length===0 的那条会话（「研究DeepSeek-Harness插件开发」）。

复测入口：

```sh
node scripts/sync-upstream.mjs --check    # 应答「已最新 0.1.1-rc.2」
pnpm build && pnpm typecheck && pnpm test
node scripts/sync-upstream.mjs --smoke    # 4 项应全 PASS
node_modules/.bin/dsh --profile deepbuddy --port 3081   # 人工目检入口
```
