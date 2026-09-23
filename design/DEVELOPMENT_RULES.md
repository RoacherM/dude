# Dude 开发约束

> 目标：让代码保持官方优先、最小侵入，同时保持未来可重构。
> 默认策略：**直接实现，晚点抽象。**

---

## 1. Rule of Three

同一类问题出现第三个真实实例之前，不建立公共框架。当前插件只有两个客户端模块
（`dsh/adapter.ts` 安装样式表、注册 Hero 品牌标记），远未触发任何抽象信号。

禁止为“未来也许会有”提前建立：

- Registry Service；
- Manifest；
- Feature 目录 / 静态 Catalog；
- DSL；
- Slot Catalog；
- Placement Map；
- Version Negotiation。

---

## 2. 官方优先与最小侵入原则（Official-First & Minimal-Invasiveness）

1. **不重复造轮子**：能用 DSH 官方组件与能力（官方侧边栏、会话交互流、设置弹窗、
   dockkit 右栏及其 Files 页），绝不自造第二套平行实现。官方暂缺的能力（锁定版本右栏
   没有终端和浏览器）靠升级官方版本补。
2. **避免脆弱的 CSS 隐藏**：绝不通过 `div[class*="_hash"] > span` 暴力隐藏或改写官方
   组件；拖拽区域这类必须定位官方元素的规则，用官方暴露的 `data-*` 属性，不用 hash
   化的 CSS 类名。
3. **通过标准扩展槽接入**：Dude 唯一使用的扩展点是 `conversation.hero.brand.mark`
   槽。新增接入点前先确认官方是否已提供等价能力。
4. **不覆写内部私有 ABI**：不模拟或依赖官方未公开的内部方法，保障上游快速升级零破损。
5. **保障上游零阻力升级**：任何改动必须保证在 DSH 核心包 `pnpm update` 时不发生布局
   断裂或服务成环死锁——`cordis.patch.yml` 不禁用 `ui-layout` / `ui-sidebar`，不重复
   声明 `root` 或第二份 `layout`。

---

## 3. DSH ABI 约束

`dsh/adapter.ts` 是唯一理解 DSH slot 注册 ABI 的文件。新增或修改与官方 slot、Cordis
Context 相关的代码只应出现在这里；`app/App.tsx` 只做装配（`inject` 声明 + 调用
`mountOfficialServices`），`ui/styles.ts` 只是一段 CSS 字符串和装卸它的函数，不感知
DSH ABI。

---

## 4. Cordis / DSH Effect

- 所有注册（样式表安装、slot 注册）必须包在 `ctx.effect(...)` 里，插件卸载时自动撤销；
- 不依赖偶然的加载顺序；
- 依赖通过 `inject` 显式声明（当前只有 `['slots']`）；
- 仅在官方已有真实扩展点时直接使用 Slot，不为了 Dude 的普通样式或品牌需求另建
  平行 Slot 系统。

---

## 5. UI 与 CSS

- 样式表通过 `installStyles()` 一次性挂一个 `<style>` 元素，卸载时整体移除；不逐条
  注入、不散落在多个文件。
- 选择器优先定位官方组件暴露的 `data-*` 属性或语义 HTML（`header:has(...)`），不写
  死官方组件的 hash 化 class 名。
- 不覆盖官方组件的颜色、圆角和字体。尺寸和位置只动三处：官方左栏 `padding-top: 36px`
  让出红绿灯；右栏全屏且左栏展开时，全屏面板的 `left` / `max-width` 锚到左栏右缘；
  左栏收起时，全屏面板左上 Tab 栏 `padding-left: 80px`。Tab 栏高度保持官方值。细节见
  `DESIGN_INTENT.md` §2。
- 拖拽区域加在官方元素本身上，不盖覆盖层；被全屏面板盖住的拖拽区（会话标题栏、收起的
  左栏 rail）要切回 `no-drag`，因为 Electron 不管上面画了什么都照收拖拽矩形。
- 没有 Dude 专属的 KIT 组件库或 Token 体系——参见 `DESIGN_INTENT.md` §4。

---

## 6. Electron 与 Host

- Renderer 不直接 import Node 或 Electron 主进程 API。
- 壳没有 Preload、没有 IPC、没有原生菜单（`win.removeMenu()`），不开 `webviewTag`；
  新增任何一样前先确认官方 web 客户端里做不到。
- Host 半部（`src/host.js`）当前是空实现；若未来需要新增 host 侧能力，先确认官方
  Host 服务是否已提供等价端点，不重建会话围栏或文件端点这类官方已有能力。
- DSH Approval 与 Sandbox 继续作为真正权限边界。

---

## 7. 测试最低要求

`tests/plugin.test.mjs` 把构建产物（`lib/client.js` / `lib/index.js` /
`cordis.patch.yml` / `package.json`）当作契约来检查：

- bundle 自注册、依赖表只包含平台外部模块；
- `cordis.patch.yml` 不禁用官方 `ui-layout` / `ui-sidebar`，`ui-conversation` 保持启用；
- bundle 不重新声明 `root` / `sidebar` / `main` / 第二份 `layout` / 第二套主题；
- 拖拽区域规则和 Hero 品牌标记存在于 bundle 中；
- 右栏全屏的锚点规则、收起左栏时的 80px 让位、全屏时的 `no-drag` 切换存在于 bundle 中；
- Hero 鱼标不是官方鲸鱼的路径；
- 已删除的功能（Terminal、`deepbuddyFiles`、`/deepbuddy/terminal` 等）
  不出现在 bundle 或 host 半部里；
- `package.json` 没有运行时 `dependencies`（`node-pty` / `ws` 等已随 Inspector 一起
  移除）。

新增代码修改这份契约前，先确认是在扩大官方优先的边界，还是在悄悄重建一套平行实现。

---

## 8. Code Review 检查表

- [ ] 这是官方已有能力，还是真的官方没有？
- [ ] 是否新增了对官方内部私有 ABI 的依赖？
- [ ] `cordis.patch.yml` 是否仍然只 insert 一行，不 disable 任何官方行？
- [ ] Effect 是否清理（卸载插件后官方界面完整可用）？
- [ ] 是否为“未来也许需要”预先建立了 Catalog / Registry / Feature 目录？
- [ ] 拖拽区域规则是否只加在官方元素本身上，没有盖住官方控件？在左栏展开 / 收起、
      右栏全屏几种状态下目测过？

---

## 9. 明确反模式

```text
自造第二套侧栏或右栏
覆写官方内部私有 ABI 或 hash 化 class 名
为单个样式改动建立 Feature 目录 / Catalog / Registry
Host 半部重新实现官方已有的文件或终端端点
为了“未来插件市场”冻结当前内部接口
```

看到这些代码，优先删除抽象，而不是补齐抽象。
