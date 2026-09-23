# Dude 当前设计文档

> 状态：**现行，可直接据此开发**
> 更新：2026-09-23

Dude 是 DeepSeek Harness 的精选 Electron 客户端。

- DSH 负责 Agent、Session、Tool、模型、文件系统、审批和沙箱等能力，以及应用布局
  （官方 `ui-layout`）、左右两侧栏（官方 `ui-sidebar` / dockkit）与会话核心交互。
- Dude 只贡献桌面窗口的拖拽区域（含红绿灯避让），其余界面（包括 Hero 的鲸鱼标记）
  一字不改地复用官方实现。
- 当前是模块化单体客户端，不建设公开的 UI 插件平台。

## 文档效力

按以下顺序理解当前设计：

| 文件 | 用途 | 约束力 |
|---|---|---|
| [`../AGENTS.md`](../AGENTS.md) | Coding Agent 开工约束与提交检查（在仓库根） | 执行入口 |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 系统边界、模块关系、DSH 集成方式 | 最高 |
| [`DESIGN_INTENT.md`](./DESIGN_INTENT.md) | 拖拽区域的交互与视觉约束 | 高 |
| [`DEVELOPMENT_RULES.md`](./DEVELOPMENT_RULES.md) | 开发时必须遵守的工程约束与检查表 | 高 |
| [`FEATURE_MAP.md`](./FEATURE_MAP.md) | 当前功能落点、状态 Owner | 当前状态 |
| [`prototype/`](./prototype/README.md) | 早期自绘界面的可交互原型 | 历史视觉参考，不约束实现 |

发生冲突时，以靠前文件为准。原型不参与排序：界面全部是官方的，没有自绘 UI 需要先在
原型上验证。

## 当前一句话

> **官方能做的一律用官方；Dude 只在官方没有的一处（窗口拖拽）落自己的代码。**

## 当前不做

- 自绘的第二套侧栏、右栏或检查器；
- 动态安装和卸载 UI 插件；
- 面向第三方的 `register / declare / surface` 公共协议；
- Placement、`when`、Context Key 等全局 UI DSL；
- 任意面板、自由浮窗、任意 Webview；
- 插件市场和运行时 UI 热插拔；
- 为每个局部点击动作建立全局 Command；
- 独立的 KIT 组件库或设计令牌体系。

它们并非永远禁止，只是必须等真实需求出现后再评估。

## 现行状态

`plugins/dude/` 只有两个客户端模块和一个空 host 半部：

1. `src/client/app/App.tsx`：入口，装配 `dsh/adapter.ts`；
2. `src/client/dsh/adapter.ts`：安装样式表（`ui/styles.ts`：拖拽区域、红绿灯避让、
   右栏全屏让出左栏）；
3. `src/host.js`：空实现。

客户端 bundle 约 6KB。已删除的自研部分（三列布局壳、Inspector、KIT、设计令牌、Preset
Plane、Session 围栏、host 侧文件 / 终端端点）列在 [`FEATURE_MAP.md`](./FEATURE_MAP.md)
§3。锁定的 0.1.5-rc.3 官方右栏只有 Files 页，终端和浏览器是能力缺口，升级到 0.1.6
由官方补上。

细则见 [`ARCHITECTURE.md`](./ARCHITECTURE.md) 与 [`DESIGN_INTENT.md`](./DESIGN_INTENT.md)。
