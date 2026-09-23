# dude-desktop

Dude 桌面壳（Electron）。一个 `hiddenInset` macOS 窗口加载发行版 profile 的 web 界面
（官方 dsh-base + dsh-web-app bundle 加 `dsh-plugin-dude`）；整个 UI 由官方 web 客户端
渲染，窗口拖拽区域由插件样式表声明。壳只管窗口和 dsh 进程：

- 红绿灯在 `trafficLightPosition {x: 14, y: 17}`，中心约在窗口顶下 24px，与官方会话
  标题栏按钮、右栏 Tab 同一行，落在插件给左栏留出的 36px 顶带里。
- 窗口底色跟官方地色 `--dsw-alias-bg-base` 一致：浅色 `#ffffff`、深色 `#151517`，
  快速拖动或缩放时不闪错色。
- 菜单是 macOS 标准菜单（⌘C / ⌘V 靠它），Dude 菜单里多一项「检查内核更新…」；没有
  Preload、IPC 或 webview。
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
「检查内核更新…」从 npm 装更新的 dsh 进去并重启内核，起不来就删掉它、回到原来的版本
（设计见 `design/ARCHITECTURE.md` §8「内核热更新」，代码在 `kernel.js`）。

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
