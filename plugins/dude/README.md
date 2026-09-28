# dsh-plugin-dude

Dude 发行版的插件行。官方 `ui-layout` 画窗口，官方侧栏画左列，官方会话画中列，
官方 dockkit 画右栏。窗口用桌面壳的系统标题栏（见 `apps/desktop/`），拖动窗口是
系统行为，页面不需要声明任何拖拽区域，所以这个插件没有界面代码：`apply` 是空函数。
Hero 用官方鲸鱼标记。

```text
src/
├── client/
│   └── app/App.tsx      # 入口：name + 空 apply(_ctx)
└── host.js               # Host 半部：内核更新重启前回答「有没有进行中的任务」
```

插件行留着，是因为打包（`stage-runtime.sh`）和 profile 生成引用它、且
`scripts/sync-upstream.mjs` 的冒烟检查要在 boot manifest 里认出 `dsh-plugin-dude`。
没有 `features/`、没有静态 Catalog、没有 Layout Store、没有 KIT 或设计令牌。
`package.json` 没有运行时 `dependencies`。

已删除的自研功能：三列布局壳、Inspector（Terminal / Browser / Files 预览）、host 侧
`deepbuddyFiles/*` 端点、`/deepbuddy/media`、`/deepbuddy/terminal`、窗口拖拽区域样式表
（`dsh/adapter.ts` + `ui/styles.ts`，随无边框窗口一起删除，见
`design/DESIGN_INTENT.md` §2），以及 `node-pty` / `ws` / `xterm` 等运行时依赖。
Files 由官方右栏提供；终端和浏览器在锁定的 0.1.5-rc.3 里官方还没有，上游 0.1.6 的
`ui-sidebar-terminal` / `ui-sidebar-browser` 补上。

## 架构要点

- **只有一个客户端模块**：`app/App.tsx`，`apply(_ctx)` 是空函数。Dude 不注册任何
  slot，Hero 是官方鲸鱼。
- **官方 frame 保持启用**：`cordis.patch.yml` 只 insert `dude` 这一行，不禁用或重述
  任何官方行。Dude 不注册 `root`，不提供第二份 `layout`。
- **没有窗口 chrome 代码**：桌面壳用系统标题栏加载页面，标题固定为「Dude」；插件不
  往页面里插入样式或声明 `-webkit-app-region`。

## 已知边界

- 没有 Dude 自己的 Terminal / Browser / Files 预览。锁定版本的官方右栏只有 Files 页，
  终端和浏览器要等升级到 0.1.6。
- host 侧只有一件事：桌面壳经 Node IPC 发来 `update-tasks`，`src/host.js` 用官方
  `agents` / `jobs` 服务按官方桌面版的规则回答有没有进行中的任务。不在桌面壳里跑（开发
  profile、直接跑 `dsh`）时没有 IPC 通道，它什么也不做。

## 安装

```sh
cd /path/to/dude
dsh --profile dude --from-default-profile web --dump-config > /dev/null
dsh plugin --profile dude add ./plugins/dude
dsh --profile dude --port 3081
```

源码 checkout 用 `pnpm dsh ...`。卸载：`dsh plugin --profile dude remove dsh-plugin-dude`（官方 shell 立即还原）。

## 开发

```sh
pnpm --filter dsh-plugin-dude build       # lib/index.js + lib/client.js
pnpm --filter dsh-plugin-dude test        # 构建 + bundle 契约测试（11 条，tests/plugin.test.mjs）
pnpm --filter dsh-plugin-dude typecheck
```

契约测试把构建产物当 artifact 检查：自注册、依赖表只剩平台外部模块、官方 frame 未被
重新声明、bundle 中不出现 `app-region` 或 `<style>` 注入、Hero 未被替换、已删除功能
（xterm、`deepbuddyFiles`、`/deepbuddy/terminal` 等）不出现在 bundle 或 host 半部里、
`package.json` 没有运行时 `dependencies`。

桌面壳见 `apps/desktop/`（Electron，加载发行版 profile）。
