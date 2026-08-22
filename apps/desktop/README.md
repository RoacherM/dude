# deepbuddy-desktop

DeepBuddy 桌面壳（Electron）。v1 = 一个 `hiddenInset` macOS 窗口加载本地 `dsh --profile deepbuddy`（发行版 profile：官方 dsh-base + dsh-web-app bundle 加 `dsh-plugin-deepbuddy`）；整个 UI 由 `plugins/deepbuddy` 插件在 web 客户端内渲染，壳只提供原生窗口 chrome（红绿灯对齐 48px 窗口行、拖拽区、外链走系统浏览器）。

## 运行

```sh
# 1. 确保 deepbuddy profile 装好且服务在跑（安装步骤见仓库根 README）
dsh --profile deepbuddy &

# 2. 启动壳
pnpm --filter deepbuddy-desktop start
# 非默认端口：DSH_WEB_URL=http://127.0.0.1:3081 pnpm --filter deepbuddy-desktop start
```

`DSH_WEB_URL` 默认 `http://127.0.0.1:3080`——发行版 profile 的默认监听地址；本机 3080 被别的 profile 占用时用 `dsh --profile deepbuddy --port 3081` 并同步 `DSH_WEB_URL`。服务未就绪时壳会每秒重试加载。

## 验证钩子

```sh
DSH_DESKTOP_SCREENSHOT=/tmp/deepbuddy.png pnpm --filter deepbuddy-desktop start
```

加载完成 1.5s 后截图到指定路径并退出，用于无人值守确认壳能渲染。

## 后续

- 壳内自动拉起/托管 `dsh --profile deepbuddy` 进程（当前假设外部已启动）。
- 换用 harness 预留的 file:// + IPC fetch 通路（`docs/subsystems/web-server.md`：webserver 只服务浏览器，Electron 不复用），摆脱本地 HTTP 端口。
- 打包（electron-builder）与 Archivo 字体本地化。
