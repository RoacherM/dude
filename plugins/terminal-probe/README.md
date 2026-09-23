# dsh-plugin-terminal-probe

**这是一个验收探针，不是发行版的一部分。用完可以整个目录删掉。**

它存在的唯一理由是回答 P4a 的验收问题：

> 装一个该面的真实生态插件，在 Dude 界面里出现并可用。

所以它被刻意写成「任何第三方插件都会写成的样子」——一次
`slots.inject('shell.overlay', …)` 注册，对 Dude 一无所知，样式走自己的
类前缀与 `--dsw-alias-*` token，生命周期全挂在插件 fiber 上。它能在 Dude
的界面里出现并跑通命令，就说明那个面是真的开着的。

## 它是什么

- **host 半部**（`src/host.js`）：一个 Remote 端点 `terminalProbe/exec`，
  经宿主自己的 `ctx.shell` 执行器跑一条前台命令，回传
  `exitCode / signal / timedOut / stdout / stderr`。命令因此受本 profile 的
  执行器沙箱（`bash-sandbox`）约束，探针不自带任何绕过。15s 超时、64KB stdout 上限。
- **client 半部**（`src/client/index.tsx`）：右下角一块浮动面板，
  注册进 `shell.overlay` 列表槽（`id: terminal-probe`、`order: 200`，
  排在官方工作区抽屉的 100 之后）。输入命令回车 → 打印 stdout / stderr / 退出状态。

## 装、验、删

```sh
DSH=/Users/byron/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh   # 你机器上的路径

pnpm --filter dsh-plugin-terminal-probe build
"$DSH" plugin --profile dude add /Users/byron/Desktop/Projects/Devs/dude/plugins/terminal-probe
"$DSH" --profile dude --port 3081      # 面板出现在右下角，跑 `echo hello`

# 删：
"$DSH" plugin --profile dude remove dsh-plugin-terminal-probe
rm -rf plugins/terminal-probe
```

## 为什么它不进「精选插件」

`UPGRADE.md` 的准入四条它满足前三条（有测试、可独立安装、不 gate root shadow、
失败即值不抛），但它没有产品理由：Dude 的终端是工作区面板的活，
不是一块右下角浮窗。它留在仓库里只是为了让 P4a 的验收结论可以随时复跑。
