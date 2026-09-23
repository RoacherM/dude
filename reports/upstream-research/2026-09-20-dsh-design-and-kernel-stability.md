# deepseek-harness 设计与内核稳定性评估

- 日期：2026-09-20
- 问题：dsh 的内核是否稳定到可以"完全基于官方内容自己拼一个 UI"，以换取更高可玩性。
- 依据：上游仓库 `deepseek-ai/deepseek-harness`，main 分支 head `ddefc45`（2026-09-17）。比对了三个 tag：`dsh-v0.1.3-alpha.1`（09-04）、`dsh-v0.1.5-rc.2`（09-10）、`dsh-v0.1.6-alpha.2`（09-17）。
- 结论：内核不稳定，但拼装机制是官方明确鼓励的用法。可以自己拼，前提是拼在"行"这一层，不接管 frame。

## 一、上游怎么拼装一个 dsh

运行中的 dsh 是一棵 cordis 插件树。cordis 是 DeepSeek 自家的依赖注入框架，插件声明自己提供什么服务、注入什么服务，运行时按依赖顺序激活。

树的内容由四层叠出来，后面的覆盖前面的：

```
base bundle          基础运行时：连接、会话、模型、工具、存储
  ↓
web-app bundle       Web 界面：约 49 行客户端插件，外加 host 侧 webserver
  ↓
profile patch        某个 profile 自己的 cordis.patch.yml
  ↓
home patch / --patch 用户主目录和命令行叠加
```

bundle 是一个 npm 包，带一份 `cordis.patch.yml`，里面每一行是一个插件条目。profile 是一份配置，写明按什么顺序叠哪些 bundle。`dsh --profile web --dump-config` 会把最终展开的每一行打印出来，任何一行都能在自己的 patch 里禁用或替换。

官方在 web-app bundle 的注释里直接写着某一行删掉后哪个面板就消失。贡献指南也说：官方仓库里的包不比社区包更重要，把仓库当作理念、示例和灵感来源，而不是必须遵循的方向。所以"自己拼"不是绕过官方设计，就是官方设计。

真正不可替换的只有十来行：连接、模块加载器、渲染器、槽位、主题、locale、会话，以及 host 侧的 webserver 和 api gateway。其余都是可选行。

## 二、内核现在稳不稳

不稳。官方 README 原话："DeepSeek Harness 处于开发者预览阶段，正在快速迭代。未来将出现破坏兼容性的变更。"仓库里没有 semver 承诺，没有废弃期政策。

我按层数了源码文件的改动比例。分子是两个 tag 之间改过的 `src/` 文件数，分母是新 tag 里的 `src/` 文件总数。

0.1.5-rc.2 到 0.1.6-alpha.2，相隔七天：

- client：416 / 920，约 45%
- api：43 / 79，约 54%
- boot：21 / 22，约 95%
- core：20 / 43，约 47%
- session：19 / 78，约 24%

0.1.3-alpha.1 到 0.1.5-rc.2，相隔六天：

- client：311 / 800，约 39%
- api：23 / 68，约 34%
- core：21 / 43，约 49%
- session：44 / 77，约 57%

所谓内核（core、api、boot、session）的翻动速度和 UI 层一样快，每周近半。现在没有哪一层能称为稳定。DeepBuddy 每次同步上游都要修一轮，原因就在这里，不是我们的写法有问题。

## 三、哪一层拼起来贵

贵的是 frame，也就是 `ui-layout` 这一行。它一次注册四个子槽位：左栏 `sidebar`（单例）、中栏 `main`（按 key，保留 key 是 `conversation`）、右栏 `rightbar`（单例，owner 拿到 width、viewportWidth、canShow 三个属性）、覆盖层 `shell.overlay`（列表）。同时它提供 `ctx.layout` 的五个动词（selectPanel、beginNavigation、toggleSidebar、openRightbar、closeRightbar）、全局钩子 `usePanelInfo`，还坐着主题投影器。

官方的 `ui-sidebar`、`ui-sidebar-right`、`ui-workspace` 三个插件都注入 `layout`。文档规定：往 `sidebar` 槽注册是整体替换，不是追加。所以一旦自己做 frame，官方侧栏就不能白用，必须自己补齐这套合同，并且跟着上游每周变。这正是 DeepBuddy 过去半年一直在补的东西，也是这次"闪退"里服务环（`uiWorkspace` 等 `layout`，`layout` 由我们提供）的根源。

不贵的是行。禁一行、加一行、换一行，只依赖 cordis 的插件接口和该行自己的服务签名，不依赖 frame 内部结构。

## 四、两个直接影响方向的发现

0.1.6-alpha 已经把浏览器和终端做成官方右栏标签，进了 web-app bundle，npm 已发布：

- `ui-sidebar-terminal` 走新的 host 侧 `api/terminal-controller`。刷新后能恢复 PTY 进程，跟随主题。
- `ui-sidebar-browser` 目前只有 iframe 载体，Web 和 Desktop 构建行为一致。它把载体抽成 `BrowserFrame` 接口，`IframeImpl` 是现有实现。决策记录写明 `ElectronWebViewImpl` 已经设计好但延期，要等打包 app 验证 overlay 层叠、cookie 隔离和权限拒绝路径后才启用。DeepBuddy 现有的 Electron `<webview>` 浏览器在这一点上比官方超前，并且官方留了接口给它。

官方桌面版就在仓库 `apps/desktop`，是 private 包，不发 npm。结构和 DeepBuddy 的壳几乎一样：Electron 套原封不动的 web 客户端，独占 `desktop` 这个 profile 名，内置运行时，端口 19387。产品 UI 完全是 web 那套。也就是说官方自己也没有为桌面端另做一套 frame。

## 五、建议

拼，但拼在行这一层，不拼在 frame 这一层。

- 把 `dsh-plugin-deepbuddy` 做成一个 bundle，叠在 base 和 web-app 之上。
- 用自己的 patch 层禁掉不要的行、加自己的行：Electron webview 浏览器载体、字体和主题 token、中文文案、品牌。
- 保留官方 `ui-layout`、`ui-sidebar`、`ui-sidebar-right`。
- 可玩性不损失，因为每一行仍然可换。损失的只是"拥有那个每周都在变的 frame 合同"。
- 等上游出现废弃政策，或版本进入 0.2，再评估是否接管 frame。

时机上：0.1.6 自带终端和浏览器，不必把现有终端移植到右栏。等 0.1.6 出 rc 再同步。届时 `host.js` 里的 PTY 相关代码大概率可以退役，浏览器则把我们的 webview 实现按 `BrowserFrame` 接口接进去。

## 备注

- 上游的设计决策记录都在仓库 `.agents/notes` 下，按 implemented、proposed、rejected 分类。以后判断某个功能会不会来，先看那里。
- 上游 `docs/architecture.zh.md`、`docs/cordis-primer.zh.md`、`docs/capability-seams.zh.md` 三份是理解拼装模型的入口。
- 本次评估只读了上游仓库，没有改本仓库任何代码。方案选择待用户拍板。
