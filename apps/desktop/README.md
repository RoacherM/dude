# dude-desktop

Dude 桌面壳（Electron）。一个用 macOS 系统标题栏的窗口加载发行版 profile 的 web 界面
（官方 dsh-base + dsh-web-app bundle 加 `dsh-plugin-dude`）；整个 UI 由官方 web 客户端
渲染，完整铺在系统标题栏下面，拖动窗口就是拖这条系统标题栏。壳只管窗口和 dsh 进程：

- 标题栏是 Electron 默认窗口的系统标题栏，标题固定显示「Dude」——`main.js` 拦截
  `page-title-updated`，不让页面的 `<title>` 顶掉它。
- 窗口底色跟官方地色 `--dsw-alias-bg-base` 一致：浅色 `#ffffff`、深色 `#151517`，
  快速拖动或缩放时不闪错色。
- 菜单是 macOS 标准菜单（⌘C / ⌘V 靠它），Dude 菜单里多一项内核更新，文字跟着更新
  状态变。Preload 只提供官方的 `window.dshDesktop.updates`，官方侧栏左下角据此显示
  更新状态；没有 webview。
- 页面里打开新窗口的链接一律交给系统浏览器。
- 应用图标 `build/icon.png`（胖蓝鱼），源图 `build/icon-source.png`。

## 两种运行方式

打包版（`resources/dsh-runtime` 存在）：

1. `~/.dude` 不存在时从 `~/.dsh` 复制设置、凭据、预设、storages 和 sessions；
2. 生成 `~/.dude/profiles/dude-app`，把 app 资源里的插件复制进它的 `node_modules`；
3. 找一个空闲端口，用 Electron 自带 Node（`ELECTRON_RUN_AS_NODE=1`）起
   `dsh --profile dude-app --port <端口> --no-open`，`DSH_HOME=~/.dude`；
4. 从 dsh 输出里读带一次性 `?token=` 的地址，等服务应答后加载。

第 3 步用的内核是 app 自带的基线和 `~/.dude/runtime/` 里热更新装的版本中最高的那个。
热更新照官方桌面版的流程：后台每 10 分钟查一次 npm，有新版时侧栏左下角显示「新版本」；
点它在后台下载（显示百分比），下好后点「安装并重启」，确认没有进行中的任务（有就先问），
在同一个端口重启内核。起不来就删掉它、回到原来的版本。设计见
`design/ARCHITECTURE.md` §8「内核热更新」；代码：`updates.js`（状态和流程）、
`kernel.js`（安装）、`preload.cjs`（给页面的接口）。`pnpm test` 跑 `updates.test.js`。

退出 app 时连同 dsh 进程组一起结束；关窗不退出，重新激活时连回同一个服务。

开发版（`electron .`，没有打包资源）：不起 dsh，直接加载 `DSH_WEB_URL`
（默认 `http://127.0.0.1:3080`），加载失败每 1.2s 重试。

开发用 profile `dude` 装在 `~/.dude/profiles/dude`，插件以链接方式指回本仓库，改完
`pnpm build` 后刷新页面即可。第一次先装好它：

```sh
export DSH_HOME=~/.dude
node_modules/.bin/dsh --profile dude --from-default-profile web --dump-config > /dev/null
node_modules/.bin/dsh plugin --profile dude add "$PWD/plugins/dude"
```

`scripts/dude` 设好 `DSH_HOME=~/.dude` 后起这个 profile，参数原样透传：

```sh
# 1. 起开发 profile
./scripts/dude --port 3081 --no-open

# 2. 启动壳
DSH_WEB_URL=http://127.0.0.1:3081 pnpm --filter dude-desktop start
```

## 打包

```sh
pnpm --filter dude-desktop stage   # 只备 staging/runtime 与 staging/plugin
pnpm --filter dude-desktop pack    # 备料 + 出 .app 目录
pnpm --filter dude-desktop build   # 备料 + 出 .app 和 dmg（macOS arm64）
```

`stage-runtime.sh` 在仓库外用 hoisted 布局装锁定版本的 `@deepseek-ai/dsh`，得到不链接
回仓库的自包含依赖树，连同构建好的插件和热更新要用的 pnpm 一起作为 extraResources 打进
app。插件每次打包都会重新构建。

## 验证钩子

```sh
DSH_DESKTOP_SCREENSHOT=/tmp/dude.png pnpm --filter dude-desktop start
```

加载完成 1.5s 后截图到指定路径并退出，用于无人值守确认壳能渲染。

## 后续

- 换用 harness 预留的 file:// + IPC fetch 通路（`docs/subsystems/web-server.md`：webserver 只服务浏览器，Electron 不复用），摆脱本地 HTTP 端口。
