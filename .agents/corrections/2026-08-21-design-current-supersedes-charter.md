# 现行设计只有 deepbuddy-design-current/；代码跟着它改，不是它跟着代码改

- 日期 / agent：2026-08-21 / claude
- 我原来的理解：review 发现 `deepbuddy-design-current/` 与既有实现冲突，
  我建议**改文档、以代码为准**，理由是实现已跑通且有契约测试。
- 用户实际要的：**改代码，新文档为准**；仓库里**只保留当前设计**，
  与前代设计相关的文件与叙述一律不留——它们只会给 agent 引入无用上下文。
- 分歧根源：范围假设——我把「已实现且有测试」当成裁决依据，
  用户的取向是设计先定形、实现向它收敛。既有实现不是免死金牌。
- 以后如何避免：仓库里出现多套设计文档时，先问「哪一套是现行」，
  拿到答案再谈代码与文档谁让步；不要用「代码已经这么写了」当默认裁决理由。
  归档不等于保留——用户要的「去掉」就是从仓库里消失，不是挪个目录继续躺着。

## 现行边界

- 设计文档只有 `deepbuddy-design-current/`（六份 + `notes/` + `design/` 配图），
  开工入口是仓库根 `AGENTS.md`。
- 本目录 2026-08-21 之前的 correction 只作过程记录，**不构成现行设计约束**；
  约束一律以 `deepbuddy-design-current/` 为准。

## 代码侧待办（本次未动手）

`plugins/deepbuddy/` 需向 `ARCHITECTURE.md` 第 11 章的源码结构收敛。
迁移时一并清理六处失效的文档引用注释：
`cordis.patch.yml:10`、`tests/plugin.test.mjs:148`、`src/client/index.tsx:11`、
`src/client/Main.tsx:14`、`src/client/seats.ts:20`、`src/client/Chrome.tsx:12`。

另有两处代码事实与现行设计不符，属迁移范围：

1. `maximized`（右列铺满）在 6 个文件 13 处，现行设计的动作集里没有它——
   `frame.ts:40,115,154,199,214,226`、`Chrome.tsx:138,169,172,366,368,398`、
   `seats.ts:58`、`icons.tsx:60`、`styles.ts:35`。
2. 设置当前是整窗壳（`Chrome.tsx:259-264`），
   `DESIGN_INTENT.md` 第 6 章要求它只替换主列。
