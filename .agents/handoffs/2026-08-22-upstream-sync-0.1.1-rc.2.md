# 上游同步 0.1.0-rc.6 → 0.1.1-rc.2 handoff

- 日期 / agent：2026-08-22 / claude
- 目标：正式开发前把官方 DSH 同步到最新（0.1.1-rc.2），并摸清接口变更。

## 已完成

- **接口变更盘点**：`reports/upstream-sync/2026-08-22-api-diff-rc6-to-0.1.1-rc.2.md`
  （方法：npm pack 新版 7 个直接依赖包，逐包 diff `.d.ts`；bundle 组成对比）。
  结论：对现有插件代码零破坏；`prompt()` 新增 `AbortSignal`、
  conversation aborted-turn 语义精化、web-app 新增附件/@文件引用/@会话引用能力面。
- **升级落地，插件侧零源码改动**：
  - `plugins/deepbuddy` + `plugins/terminal-probe` 钉版本 bump 到 0.1.1-rc.2；
  - pnpm-lock 整锁重生成（旧锁备份在 `/tmp/pnpm-lock.rc6.backup.yaml`）；
  - 根 `package.json` 新增 devDep `@deepseek-ai/dsh@0.1.1-rc.2`——server 侧
    runtime 从此钉在仓库里，不再依赖 npx 缓存（原来那份是 rc.6）。
- **`scripts/sync-upstream.mjs` 三处修复**：
  1. bump 后删除 pnpm-lock 强制整锁重解析（快照仍在，回滚不受影响）；
  2. `resolveDsh()` 优先 `node_modules/.bin/dsh`；
  3. bump 清单纳入根 manifest；冒烟 boot 清单正则适配新版
     `globalThis["__DSH_BOOT__"]` 写法。
- **README**：版本描述更新为 0.1.1-rc.*，补「CLI 钉在根 devDeps」说明。

## 验证（全绿）

```sh
node scripts/sync-upstream.mjs --check   # 已最新 0.1.1-rc.2
pnpm build && pnpm typecheck && pnpm test  # deepbuddy 45 条、terminal-probe 5 条
node scripts/sync-upstream.mjs --smoke   # 4 PASS：首页/bundle、presets、
                                         # deepbuddyFiles 会话围栏、boot 清单
```

## 关键教训（跨 session 复用）

**陈旧 pnpm-lock 会劈裂 TypeScript 类型图**：上游把增补类型来源从 dependencies
挪成 peerDependencies 后，增量 install 会拿 lock 里旧版本条目满足新 peer 范围
（只 WARN 不报错），`.pnpm` 里新旧两套实例并存，module augmentation 打不到同一份
文件，症状是事件键变 `never`、augment 出来的成员「不存在」。跨大版本 bump 一律
删 lock 重装；`pnpm why <pkg>` 能看到 peer 被旧版本满足的证据。

## 未完成 & 下一步

- **人工视觉验收**（README 规定升级后必过 DESIGN_INTENT §14 清单）：
  `node_modules/.bin/dsh --profile deepbuddy --port 3081`，重点目检
  暗色主题补丁（theme.ts）、aborted turn「已停止」节点、
  以及此前 nodes.length===0 的会话「研究DeepSeek-Harness插件开发」。
- 仓库仍是零 commit；baseline commit 待用户发话。
- 设计 review 的两个待拍板项仍开着：架构形态（建议按「插件接管 root」定）、
  `plugins/terminal-probe` 是否删除。
- 上游新增的附件 / @文件引用 / @会话引用能力面要不要跟进，进 FEATURE_MAP 待办。
