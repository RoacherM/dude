# 方案 A（官方优先 · 最小侵入）改造与开发 Handoff 规范

- **编写日期**：2026-09-22
- **前任 Agent**：Antigravity
- **接手 Agent**：Grok
- **核心任务**：推进 DeepBuddy 从当前的“半包（自制外壳 + 内部嵌官方组件）”彻底演进至【方案 A：官方优先、最小侵入性（Official-First Thin Client）】，消除侧栏冗余与双右栏，确保与 DSH 上游快速迭代零阻力同步。
- **现行测试基线**：`plugins/deepbuddy` 全量 77 个测试 PASS（0 failure），TypeScript 全量类型检查 0 错误。

---

## 1. 核心战略定调：方案 A（官方优先 / 最小侵入）

### 1.1 核心原则
> **「官方优先，最小侵入；桌面增强，标准扩展。」**  
> （Official-First, Minimal-Invasiveness, Desktop-Augmented）

* **DSH 官方全量负责**：
  * 官方应用布局骨架（`AppFrame`）；
  * 官方原生侧边栏（工作区树、会话历史、全局搜索、新建交互、设置入口）；
  * 官方会话核心（Conversation 流、Agent Loop、Hero、输入框、模型与 Preset 选择、审批流）。
* **DeepBuddy 负责自身的核心桌面增强壁垒**：
  * **桌面原生环境托管**：Electron 窗口生命周期、macOS 交通灯对齐、原生菜单、系统托盘、安全配置隔离（`~/.deepbuddy`）；
  * **开发者资源增强（Inspector）**：提供官方暂未支持的多 Tab 检查器（内置多终端 Terminal、内嵌浏览器 Browser、多文件预览与编辑）；
  * **现代平铺无缝质感**：基于全局 Token 注入现代极简、无悬浮外壳的平铺桌面美学。

### 1.2 为什么必须转向方案 A？（上游血泪教训）
查阅 [`reports/upstream-sync/2026-09-20.md`](file:///Users/byronwayne/Desktop/Projects/sides/deepbuddy/reports/upstream-sync/2026-09-20.md)：
1. **内部接口极脆弱**：上游仅从 0.1.2 升至 0.1.5，`ui-layout` 动词就全面推倒重构（改为 `selectPanel`, `beginNavigation`, `openRightbar` 等 5 个内部动词，新增 `usePanelInfo` 根钩子）。由于 DeepBuddy 自行接管了 layout，被迫写了大量脆弱的 Mock stub。
2. **服务循环死锁**：官方 `ui-workspace` 等待 `layout`，而 DeepBuddy 客户端依赖 `uiWorkspace`，同时 `layout` 又由 DeepBuddy 提供，直接导致 12 个插件全部 pending 白屏。
3. **结构层级冗余**：
   * 左侧：自制侧栏外框包着官方工作区树，产生了两层侧栏的明显割裂；
   * 右侧：当前代码中同时渲染了 `InspectorColumn` 和官方的 `data-rightbar-col`，形成了“双右栏并存”的隐患。

---

## 2. 现状与已完成工作（已落地）

1. **消除悬浮浮岛（De-floating 满屏平铺）**：
   * [`ThreeColumnFrame.tsx`](file:///Users/byronwayne/Desktop/Projects/sides/deepbuddy/plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx)：外层窗口 padding 从 `var(--db-gap)`（10px）改为 `0`，消除浮动外边距；
   * [`ColumnFrame.tsx`](file:///Users/byronwayne/Desktop/Projects/sides/deepbuddy/plugins/deepbuddy/src/client/shell/ColumnFrame.tsx)：移除了 `PANEL` 的圆角与外框，三列以 1px 细线（`var(--db-line)`）垂直咬合；
   * `dockMax` 全屏覆盖使用 `inset: 0; width: 100%; height: 100%`。
2. **官方矢量 Logo 与文案规范**：
   * [`adapter.ts`](file:///Users/byronwayne/Desktop/Projects/sides/deepbuddy/plugins/deepbuddy/src/client/dsh/adapter.ts)：移除了过时的卡通位图与字符跳动动画，对齐官方矢量 SVG 鲸鱼 Logo（`FISH_LOGO_PATH`）；
   * [`tokens.ts`](file:///Users/byronwayne/Desktop/Projects/sides/deepbuddy/plugins/deepbuddy/src/client/ui/tokens.ts)：移除了隐藏官方 `headlineText` / `previewBadge` 的 CSS hack，官方文案「探索未至之境」与「预览版」自然展示，并配有官方 hover 微动效。
3. **全套设计与约束文档已同步更新**：
   * [`AGENTS.md`](file:///Users/byronwayne/Desktop/Projects/sides/deepbuddy/AGENTS.md)
   * [`design/ARCHITECTURE.md`](file:///Users/byronwayne/Desktop/Projects/sides/deepbuddy/design/ARCHITECTURE.md)
   * [`design/DESIGN_INTENT.md`](file:///Users/byronwayne/Desktop/Projects/sides/deepbuddy/design/DESIGN_INTENT.md)
   * [`design/DEVELOPMENT_RULES.md`](file:///Users/byronwayne/Desktop/Projects/sides/deepbuddy/design/DEVELOPMENT_RULES.md)
   * [`design/FEATURE_MAP.md`](file:///Users/byronwayne/Desktop/Projects/sides/deepbuddy/design/FEATURE_MAP.md)
   * [`design/prototype/README.md`](file:///Users/byronwayne/Desktop/Projects/sides/deepbuddy/design/prototype/README.md)

---

## 3. 接下来的需求说明与分阶段任务（Grok 任务清单）

### 阶段一：右栏合流，消除双右栏（优先级：高）

**目标**：消除 `ThreeColumnFrame.tsx` 中 `InspectorColumn` 与官方 `rightbar` 并存的别扭状态，实现右栏统一。

* **当前代码位置**：
  * [`ThreeColumnFrame.tsx:551-575`](file:///Users/byronwayne/Desktop/Projects/sides/deepbuddy/plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx#L551-L575)
* **需求细节**：
  1. 将 DeepBuddy 自己的 Inspector（Terminal, Browser, Files 预览）合流入单一右栏通道。
  2. 官方的文档预览/文件详情通过 `rightbar` 槽渲染，DeepBuddy 的 Terminal 与 Browser 应作为右侧栏的选项卡（Tabs）共同管理，或通过统一的右栏控制器管理显隐。
  3. 严禁在主界面上同时展开两个右侧栏列。
* **验收标准**：
  * 打开官方文档预览或 DeepBuddy 终端时，右侧只出现一个统一宽度的分栏；
  * Terminal 进程在切换 Tab、关闭右栏或最小化时绝不中断（保持现有 Resource Keep-Alive 铁律）；
  * 自动化测试全量通过。

---

### 阶段二：侧边栏减负，回归官方原生侧栏（优先级：高）

**目标**：消除自制侧栏的“两层套壳感”，直接展示官方原生侧边栏。

* **当前代码位置**：
  * [`ThreeColumnFrame.tsx:71-125`](file:///Users/byronwayne/Desktop/Projects/sides/deepbuddy/plugins/deepbuddy/src/client/shell/ThreeColumnFrame.tsx#L71-L125)（`DeepBuddySidebar`）
  * [`Chat.tsx`](file:///Users/byronwayne/Desktop/Projects/sides/deepbuddy/plugins/deepbuddy/src/client/features/conversation/Chat.tsx)（自制的 `ChatNav` 全宽新建按钮）
* **需求细节**：
  1. **移除自制侧栏外框**：去掉 `DeepBuddySidebar` 顶部的 52px 顶栏容器以及自制的 `ChatNav` 宽按钮，使官方原生侧边栏直接铺满左列。
  2. **macOS 红绿灯安全对齐**：
     * 不要手写组件外框，利用 Electron 原生的 `titleBarStyle: 'hiddenInset'`；
     * 通过 CSS 变量 / 全局样式为官方侧边栏顶部注入 `padding-top: 36px`（安全避让带），让 macOS 红绿灯优雅悬浮在官方侧栏的留白区域。
  3. **新建与搜索交互**：完全依赖 DSH 官方侧栏已有的工作区切换、全局搜索与会话新建能力。
* **验收标准**：
  * 侧边栏层级扁平，没有外层包裹的冗余边框；
  * macOS 红绿灯位置准确，且不遮挡官方侧栏任何可点击图标；
  * 窗口拖拽手感顺畅，点击侧边栏会话项能正常切换。

---

### 阶段三：架构归一，解除私有 layout stub（优先级：中）

**目标**：恢复启用官方原生 `ui-layout` / `AppFrame`，彻底解除内部接口 mock，根治上游升级成环死锁。

* **当前代码位置**：
  * [`adapter.ts:250-280`](file:///Users/byronwayne/Desktop/Projects/sides/deepbuddy/plugins/deepbuddy/src/client/dsh/adapter.ts#L250-L280)（`mountOfficialServices` 中注入的 `layout` stub）
  * [`cordis.patch.yml`](file:///Users/byronwayne/Desktop/Projects/sides/deepbuddy/plugins/deepbuddy/cordis.patch.yml)（禁用了官方 `ui-layout`）
* **需求细节**：
  1. 评估在 `cordis.patch.yml` 中恢复启用官方 `@deepseek-ai/dsh-client-ui-layout`；
  2. 官方 `ui-layout` 接管 AppFrame 骨架后，DeepBuddy 退回到纯粹的 **Electron 桌面壳 + 插件增强层**；
  3. 彻底删除 `adapter.ts` 中针对 `selectPanel`, `beginNavigation`, `openRightbar` 的 mock stub；
  4. 验证在断开 DeepBuddy 的 `layout` 注入后，官方内部服务依赖能够自洽启动。
* **验收标准**：
  * 启动无 `Failed to load plugins` 报错；
  * 移除私有 layout mock 后，应用正常加载工作区与会话；
  * 执行 `pnpm test` 保持通过。

---

## 4. 关键绝对约束与开发红线（千万不能碰的雷区）

接手开发的 Agent 必须严格遵守以下铁律：

1. **官方优先，绝不自造平行外壳**：
   能用官方组件就用官方组件，严禁在外部重新包装自制容器。
2. **禁止破坏性 CSS 覆写**：
   严禁使用 `div[class*="_xxxx"] { display: none !important; }` 去隐藏官方组件；任何定制通过公开 Slot、官方配置或标准 Token（CSS 变量）进行。
3. **Terminal 进程生命周期铁律**：
   无论右侧栏如何收起、展开或切换 Tab，底层的 PTY 进程（`TerminalResource`）必须保持存活，严禁销毁正在运行的命令行任务！
4. **测试与拖拽区域保持（77 Tests Guard）**：
   * 运行测试：`pnpm test`（当前 77 个测试通过）；
   * 注意 `assert.match(bundle, /WebkitAppRegion: "drag"/g)` 必须保持 3 处（top bar、main-column strip、window ground）；
   * `PANEL` 必须保留 `WebkitAppRegion: 'no-drag'`。
5. **配置隔离**：
   桌面客户端一律以 `DSH_HOME=~/.deepbuddy`（profile: `deepbuddy-app`）运行，绝不可污染用户的官方 `~/.dsh`。

---

## 5. 常用命令与验证工具

```bash
# 1. 代码构建
pnpm build

# 2. 单元测试（确保 77 个全通）
pnpm test

# 3. 类型检查
pnpm -r typecheck

# 4. 本地启动 DSH 冒烟测试
node node_modules/.bin/dsh --profile deepbuddy --port 3082

# 5. 上游版本对比检查
node scripts/sync-upstream.mjs --check

# 6. Electron 桌面端打包与测试
pnpm --filter deepbuddy-desktop run pack
```
