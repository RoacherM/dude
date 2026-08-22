# DeepBuddy UI 设计意图

> 状态：现行  
> 这是一份产品与交互约束，不是公共插件协议。

---

## 1. 核心结构

```text
窗口 = 左列? + 主列 + 右列?
列 = 状态栏 + 功能区
```

- 主列永远存在。
- 左右列可以独立收起。
- 每列的状态栏归属于该列；列消失时，对应状态栏一起消失。
- 三段状态栏同高共缝，因此视觉上像一整条 Header，但结构上不是独立第四行。
- 不增加第四列、底部 Panel 或自由浮窗作为常规工作区。

三列语义：

| 列 | 主要问题 | v1 内容 |
|---|---|---|
| Sidebar | 我能去哪里？有哪些会话或对象？ | 对话入口、Session List、Settings |
| Workbench | 我正在做什么？ | Conversation、Settings |
| Inspector | 当前对象还有什么可看？ | Files、文件内容、Terminal |

---

## 2. 当前几何基线

这些是 v1 设计默认值，不是长期架构公理；修改时应同步设计稿和测试。

| 项 | 当前值 |
|---|---|
| 状态栏高度 | 52px |
| 主行高度 | 31px |
| 密行高度 | 26px |
| 左列默认宽度 | 268px |
| 左列拖拽范围 | 232–380px |
| 右列默认宽度 | 窗口的 30% |
| 右列拖拽范围 | 30%–70% |
| 右列最小宽度 | 416px，删除控件后应重新验证依据 |
| 主列保留宽度 | 460px |
| 主列内容宽度 | 右列打开时 720px 居中；右列关闭时 880px 仍居中，绝不全宽贴边 |
| 自动收右列 | 窗口宽度低于 1100px |
| 自动再收左列 | 窗口宽度低于 860px |

响应式规则：

1. 主列可用性优先。
2. 空间不足时右列先收，左列后收。
3. 用户手动关闭的列不自动重开。
4. 临时响应式收列不应覆盖用户保存的宽度偏好。
5. 右列放不下最小内容时，宁可拒绝打开，也不要打开后挤成不可用状态。

---

## 3. 四种布局状态

左右列各一个布尔状态，因此只有四种持久布局：

```text
左开 + 右开   三列工作
左开 + 右关   对话优先
左关 + 右开   工作台 + 检查器
左关 + 右关   专注主列
```

“专注模式”不是第五种模式，只是左右列都关闭。

只有用户操作和窗口响应式逻辑可以改变列状态。Feature 不主动关闭、打开或修改其他列宽度。

右列（停靠栏）与其开关只在打开了一个非空会话时可见；空白 / 新任务页不显示开关，
若 dock 已开则自动收起。切回有内容的会话时恢复用户上次的 dock 开关偏好
（layout-store 已有状态，不新增持久化）。

---

## 4. 每列两区

### 状态栏

状态栏展示：

- 这一列当前是什么；
- 当前选择；
- 运行状态；
- 作用于列或 Tab 的结构操作。

当前内容：

| 列 | 状态栏 |
|---|---|
| Sidebar | 系统红绿灯、DeepBuddy 身份、左列开关 |
| Workbench | 当前页面或 Session 标题、运行状态 |
| Inspector | 打开的 View Tabs、右列开关 |

业务 Feature 不提交任意 Header 组件。标题和状态通过普通 Props 或内部 Hook 交给 Column 渲染。

### 功能区

功能区承载真正的业务内容和局部动作：

- Session List；
- Message Stream；
- Composer；
- Settings 表单；
- File Tree；
- Terminal；
- 文件预览。

口诀调整为：

> **状态栏放身份、状态和结构操作；功能区放业务内容与业务动作。**

---

## 5. Column 组件

三列共用同一个 `ColumnFrame`：

```tsx
<ColumnFrame
  header={...}
  body={...}
  collapsed={...}
/>
```

共享内容：

- 52px 状态栏；
- 拖拽区域；
- 分隔材质；
- 标题截断；
- Focus Ring；
- 空态与滚动行为。

不同列只提供不同的数据和选择策略，不复制三套视觉实现。

---

## 6. Workbench 行为

v1 Workbench 页面：

- Conversation。

Settings 不再是主列页面，而是覆盖式设置面板（对齐 DSH web 原生 / WorkBuddy）：

```text
点击侧栏「设置」
→ 弹出覆盖式设置面板（模态 Dialog）
→ 主列保持当前会话不变
→ 面板左侧竖排导航（模型 / 模式 / 插件），右侧内容区，右上角 × 关闭
```

面板尺寸参照 WorkBuddy：居中、占视口大部（宽 min(1200px, 90vw)、高 min(860px, 90vh)）、
圆角、遮罩层点击关闭。`Esc` 关闭时先关局部 Popover，再关 Dialog（§12）。

Conversation 切回时读取 DSH Session 数据恢复，不依赖另一个页面主动通知它。

当前不需要通用 App 插件协议。页面通过静态目录组合。

---

## 7. Inspector 行为

Inspector 中区分 View 类型与 View 实例，但这是 Shell 内部数据结构，不是公共插件合同。

```text
类型：Files / Terminal / File Preview
实例：README.md / index.tsx / Terminal #1
```

规则：

- 一个实例时直接显示标题。
- 多个实例时显示 Tabs。
- 切换 Tab 默认不销毁实例。
- 关闭 Tab 后焦点优先给右邻，否则给左邻。
- 最后一个 Tab 关闭后，右列自动收起。
- 收起右列只隐藏 View，不自动销毁 Terminal 等资源。

Files 可以打开文件预览实例；Terminal 可以打开多个终端实例。

---

## 8. 零、一个、多个

这是 Column 内部的普通渲染规则：

```tsx
if (items.length === 0) return <EmptyState />
if (items.length === 1) return <Body item={items[0]} />
return <><Tabs items={items} /><Body item={active} /></>
```

适用场景：

- Inspector Tabs；
- 模型选择器；
- 某个 Feature 内部的 View 列表。

它不是公共协议。只有真实集合存在时才使用，不为了“未来可能有第二个”提前画选择器。

---

## 9. 当前最小动作集

当前视觉基线保留 9 类图标：

| # | 动作 / 状态 | 位置 |
|---|---|---|
| 1 | 开关左列 / 右列 | 两侧状态栏 |
| 2 | 新建 Session | Sidebar 对话入口 |
| 3 | 打开 Settings（覆盖式设置面板） | Sidebar 底部 |
| 4 | 复制消息 | 消息局部动作 |
| 5 | 重试失败或停止的轮次 | 消息局部动作 |
| 6 | 权限档 | Composer |
| 7 | 模型 | Composer |
| 8 | 发送 / 停止 | Composer 主动作 |
| 9 | 关闭 Inspector Tab | Tab |

规则：

- 权限档和模型同时是状态显示器；模型 chip 通过 `sessions.selectModel` 应用到会话（含运行中），并同步写入部署默认模型。
- 发送与停止复用同一个位置。
- 正常完成的消息不显示重试。
- 复制成功就地短暂反馈，不额外弹 Toast。
- 不为了未来功能预留空图标。

局部按钮直接使用 React 事件即可。只有需要快捷键、跨模块调用或多处复用的动作才进入内部 Command 表。

---

## 10. 视觉语言

DeepBuddy 当前只承诺统一暗色体验。

三条纪律：

1. **分隔靠材质，不靠密集边框。**
2. **层级靠透明度，不靠不断加粗。**
3. **颜色只属于状态，不作装饰。**

语义色：

- 绿色：运行中、成功；
- 橙色：等待批准、警告；
- 蓝色：每屏最主要的当前行动；
- 灰阶：普通层级与次要信息。

普通 UI 必须使用 KIT 和设计令牌：

- `Row` / `GroupLabel`；
- `Button` / `IconButton`；
- `Input` / `Select` / `Switch`；
- `Tabs` / `Badge` / `StatusPill`；
- `Card` / `Popover` / `Dialog` / `EmptyState`；
- `Mono`。

禁止：

- Feature 注入全局 CSS；
- 自建第二套按钮、Tab 或表单风格；
- Feature 覆盖全局主题；
- 使用颜色作无意义装饰。

代码编辑器、Terminal、Canvas、图表等专业内容可以使用专用渲染器，但外层 Chrome 仍使用 KIT。

---

## 11. 浮层

有锚点的交互就地弹出：

- Select；
- Popover；
- Tooltip；
- Context Menu。

没有稳定锚点或需要打断流程的内容进入窗口级浮层：

- Approval Dialog；
- User Question；
- 破坏性操作确认；
- Toast。

当前不开放：

- 任意 Feature 自定位浮窗；
- 任意 HTML / Webview 注入；
- 通过 Overlay 绕过三列布局。

未来 Browser 功能必须是受治理的第一方能力，而不是任意 Webview 逃生舱。

---

## 12. Focus 与键盘

- 列显隐和页面切换后，主工作焦点应可预测地回到 Workbench 或原操作对象。
- `Esc` 先关闭局部 Popover，再关闭 Dialog；不得被普通 Feature 无条件吞掉。
- 所有图标按钮有可读 Label。
- Tab、列表和菜单支持键盘导航。
- 减少动态效果时禁用非必要过渡。

---

## 13. 空态、加载、错误

每个数据型模块至少实现：

- Loading；
- Empty；
- Error。

Empty State 用一句话说明当前缺少什么，以及用户下一步能做什么。

空白 / 新会话页：问候语 + Composer 作为一组垂直居中于主列（对齐官方 DSH 布局）；
发出第一条消息后切换为常规布局（消息流 + 底部 Composer）。

Error 不只显示技术错误；在可恢复时给出明确操作。
会话打开失败（如日志损坏，`openState === 'error'`）必须渲染明确的错误卡片并
带出底层错误文案，禁止静默呈现为空白消息流。

---

## 14. 视觉验收

每次改动至少检查：

- 四种布局状态；
- 窄窗口自动收列；
- 长标题截断；
- 无 Session；
- Agent 运行中和等待批准；
- Inspector 0 / 1 / 多实例；
- Terminal 在切 Tab 和收右列后仍运行；
- 键盘 Focus 与减少动态效果。

当前配图见 `design/minimal-icons.html`。
