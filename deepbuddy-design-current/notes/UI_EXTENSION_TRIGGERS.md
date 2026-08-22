# 未来 UI 扩展协议：启动条件

> 状态：决策备忘，**不是现行 API**。

上一版设计过完整的 `declare / register / surface`、Slot、Placement、`when`、Context Keys 和动态 UI 插件模型。该方案已归档，因为当前消费者过少，协议会比功能本身更重。

---

## 1. 现在为什么不做

当前现实：

- UI 主要作者数量接近 1；
- 第一方功能少；
- 功能一起开发、一起发布；
- 内部接口可以通过同仓重构调整；
- DSH 已经在能力层提供插件组合。

因此当前更需要：

- 清楚的模块边界；
- 静态 Catalog；
- DSH Adapter；
- 测试；
- 可重构代码。

而不是公共 UI 协议。

---

## 2. 何时重新启动

满足任一条件后，重新评估：

1. 出现第一个非核心 UI 作者；
2. UI 功能需要独立安装、卸载或升级；
3. 第三次出现“新增同类功能必须修改 Shell”；
4. 已有三个独立 App、Widget 或 Renderer 共享相同接入逻辑；
5. 不同发行版需要组合不同 UI 功能；
6. DSH 自生成 UI 功能需要稳定的机器可读合同；
7. 静态组合已经造成真实冲突，而不是审美上的不够“通用”。

---

## 3. 抽取顺序

到时不要恢复旧宪章全文，而是按真实重复逐层抽取：

```text
静态数组
→ 内部 Registry
→ 稳定 Definition
→ 独立 Package
→ 动态加载
→ 外部 API Version
```

每一步都必须有当前消费者证明必要性。

---

## 4. 候选扩展点

未来最可能首先稳定的是：

- Workbench App Definition；
- Inspector View Type；
- Conversation Node Renderer；
- Tool Call Renderer；
- Settings Page；
- 少量全局 Command。

最不应优先开放的是：

- 状态栏任意组件；
- 自由布局；
- 任意 CSS；
- 任意 Webview；
- Feature 控制列几何。

---

## 5. 设计原则仍可保留

若未来正式建立扩展系统，优先保留：

- 默认功能不使用隐藏 API；
- Host 复杂，叶子插件简单；
- 状态有唯一 Owner；
- 瞬时 Effect 可清理；
- View 与 Resource 在需要时分离；
- 贡献语义数据，而不是屏幕坐标；
- 安全边界在 Host / Sandbox，而不是 Renderer 约定。
