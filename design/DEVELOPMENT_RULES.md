# DeepBuddy 开发约束

> 目标：让 v1 快速可用，同时保持未来可重构。  
> 默认策略：**直接实现，晚点抽象。**

---

## 1. Rule of Three

同一类问题出现第三个真实实例之前，不建立公共框架。

允许：

- 两处相似代码；
- 两个页面有少量不同 Props；
- 第一版使用简单 `switch`；
- 静态数组；
- 局部特例并配清楚注释。

第三次出现时再问：

- 重复的是数据形状，还是生命周期？
- 三个样本真正相同的部分是什么？
- 抽出后是否能删除代码，而不只是移动代码？

禁止为“未来也许会有”提前建立：

- Registry Service；
- Manifest；
- DSL；
- Slot Catalog；
- Placement Map；
- Version Negotiation。

---

## 2. 新增普通页面的标准动作

```text
1. 在 features/ 下建目录
2. 导出薄 Definition
3. 加入静态 Catalog
4. 接入 Adapter 数据
5. 补 Loading / Empty / Error
6. 写测试和截图
```

推荐 Definition：

```ts
export interface WorkbenchAppDefinition {
  id: string
  title: string
  icon?: IconName
  Component: React.ComponentType
}

export interface InspectorViewTypeDefinition {
  id: string
  title: string
  icon?: IconName
  createInitialState(): unknown
  Component: React.ComponentType<{ viewId: string }>
}
```

保持 Definition 薄。不要提前加入权限、版本、`when`、Provider、激活事件等字段。

---

## 3. Feature 边界

每个 Feature 只从 `index.ts` 导出公共内容。

允许：

```ts
import { TerminalViewDefinition } from '@/features/terminal'
```

禁止：

```ts
import { internalSessionCache } from '@/features/sessions/internal/cache'
```

跨 Feature 共享内容优先放：

- `dsh/`：DSH 数据和命令；
- `ui/`：纯视觉元件；
- `shared/`：真正领域无关的工具；
- 明确 Service：只有多个独立 Consumer 时。

不要建立一个无限增长的 `utils/` 垃圾桶。

---

## 4. Shell 约束

Shell 代码只能出现：

- 布局；
- Catalog；
- 当前 Selection；
- Column Chrome；
- View 实例生命周期；
- 窗口级 Overlay。

Shell 中不应出现：

```ts
if (view.type === 'terminal') { ... }
if (app.id === 'conversation') { ... }
```

允许的例外必须是视觉或结构差异，不得包含业务逻辑。

Feature 不能直接写 Layout Store。列开关只通过 Shell 暴露的用户动作修改。

---

## 5. DSH Adapter 约束

Feature 不直接解析 DSH 底层事件流。

Adapter 负责：

- 将官方对象转成稳定前端 Snapshot；
- 统一错误与 Loading 状态；
- 包装 Host 命令；
- 隔离上游版本变化；
- 提供测试 Fake。

Adapter 不负责：

- 视觉状态；
- 某个页面的展开 / 折叠；
- 业务组件布局；
- 复制第二份 Session 日志。

Adapter API 应面向业务事实，而不是机械转发所有官方字段。

---

## 6. 状态规则

### 领域状态

放 DSH 或对应 Provider：

- Session；
- Agent；
- Tool Call；
- 文件；
- Terminal Process。

### Shell 状态

放 Shell Store：

- 列显隐与宽度；
- 当前 App；
- Inspector View 实例与 Active ID。

### Feature UI 状态

留在 Feature：

- 表单草稿；
- 展开项；
- 局部搜索词；
- 滚动位置。

不要用 Effect 同步两个 State 副本。优先删除副本或计算派生值。

---

## 7. 动作与 Command

默认使用普通组件事件：

```tsx
<button onClick={() => setExpanded(v => !v)} />
```

只有满足任一条件时，才升级为内部 Command：

- 需要快捷键；
- 需要从另一个 Feature 调用；
- 同一动作有两个以上呈现入口；
- 需要菜单 / Command Palette；
- 需要统一 enablement 与审计。

v1 建议全局 Command：

- `session.new`；
- `settings.open`；
- `agent.stop`；
- `layout.toggleSidebar`；
- `layout.toggleInspector`；
- `inspector.closeActiveView`；
- `file.open`。

不必全局命令化：

- 展开文件夹；
- 复制单条消息；
- 展开详情；
- 切换页面内部 Tab；
- 表单字段更新；
- Popover 内确认。

---

## 8. Resource 模块

只有真实拥有独立资源的 Feature 才需要 Resource Manager。

Terminal 最小接口：

```ts
interface TerminalResourceManager {
  create(options: CreateTerminalOptions): Promise<TerminalId>
  attach(id: TerminalId): TerminalSnapshot
  write(id: TerminalId, data: string): Promise<void>
  resize(id: TerminalId, cols: number, rows: number): Promise<void>
  kill(id: TerminalId): Promise<void>
  dispose(): Promise<void>
}
```

明确区分：

- `collapse inspector`：仅隐藏；
- `switch tab`：仅隐藏；
- `close view`：结束 View；
- `kill terminal`：结束 Resource；
- `unload feature / app exit`：清理归属资源。

不要为了 Settings 或静态文件预览复用这套复杂生命周期。

---

## 9. Cordis / DSH Effect

第一方模块若使用 Cordis：

- 所有监听器和注册必须有 disposer；
- 不依赖偶然加载顺序；
- 依赖通过公开 Context 声明；
- 仅在 DSH 已有真实扩展点时直接使用 Slot；
- 不为了 DeepBuddy 普通面板另建平行 Slot 系统。

使用 DSH 原生 Conversation Node / Tool Renderer 时，遵守官方 Owner 边界，不在 UI 里重新配对 Tool Call 和 Result。

---

## 10. UI 与 CSS

- 所有普通 UI 使用 KIT。
- 颜色、圆角、字号、间距和动画来自 Token。
- Feature 不注入全局 CSS。
- Feature 不覆盖其他 Feature 的选择器。
- CSS Module / scoped style 只用于专业渲染器或 KIT 尚未覆盖的局部结构。
- 新增标准控件前先检查 KIT；第三次出现再加入 KIT。

专业渲染器：

- Monaco / CodeMirror；
- xterm.js；
- Canvas；
- 图表；
- 视频。

其外层 Header、Toolbar、Empty、Error 仍由 KIT 负责。

---

## 11. Electron 与 IPC

- Renderer 不直接 import Electron 主进程 API。
- Preload 暴露窄、类型化、按能力划分的方法。
- IPC 参数必须校验。
- 文件路径、进程和外链操作在 Main / Host 侧执行。
- DSH Approval 与 Sandbox 继续作为真正权限边界。
- 不把 Client 模块边界误当安全沙箱。

---

## 12. 测试最低要求

### Shell

- 四种布局状态；
- 拖拽 clamp；
- 响应式右先左后；
- 手动关闭不自动重开；
- 主列始终可用。

### Adapter

- 官方 Snapshot 到前端模型的映射；
- 无数据 / 错误 / 重连；
- 使用 Fake 时 Feature 能独立测试。

### Feature

- Loading / Empty / Error；
- 不依赖其他 Feature 内部实现；
- 卸载后 Listener 和 Timer 清理。

### Terminal

- 切 Tab 不终止；
- 收起 Inspector 不终止；
- Kill 明确结束；
- App 退出清理。

### 视觉

- 长标题；
- 0 / 1 / 多 Inspector Views；
- Focus；
- 减少动态效果；
- 当前配图对比。

---

## 13. Code Review 检查表

- [ ] 这是第三个真实实例，还是在猜未来？
- [ ] 新增的是普通模块、资源模块，还是已有真实消费者的领域 Host？
- [ ] 状态唯一 Owner 是谁？
- [ ] 是否复制了 DSH 数据？
- [ ] 是否让 Shell 知道了业务细节？
- [ ] 是否深度导入另一个 Feature？
- [ ] 是否能用普通函数 / Props，而不是新 Service？
- [ ] 这个点击动作真的需要全局 Command 吗？
- [ ] 所有 Listener、Timer、IPC 订阅是否清理？
- [ ] 是否使用 KIT 和 Token？
- [ ] 是否补齐 Loading / Empty / Error？
- [ ] 删除此 Feature 后，其他 Feature 是否仍能编译？

---

## 14. 明确反模式

```text
为两个页面建立动态 Registry
为单个按钮建立 Placement 系统
为普通 Settings 页面建立 Resource 生命周期
Shell 按 Feature ID 写业务分支
Feature 各自解析 DSH Session 日志
组件 A 通过 Ref 操作组件 B
用 Effect 来回同步两份状态
为了“未来插件市场”冻结当前内部接口
```

看到这些代码，优先删除抽象，而不是补齐抽象。
