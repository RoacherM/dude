# wave3 用户实测 5 界问题 + 1 验收缺陷 handoff

- 日期 / agent：2026-08-22 / claude
- 目标：修 3081 真机反馈的 5 个界面问题 + 1 个验收缺陷，逐项浏览器实测。
- git 基线：b7a91cd（第二波结构迁移已合入）。**未 commit**。

## 已完成（六项，全部浏览器实测通过）

基线 `b7a91cd`；改动集中在 `plugins/deepbuddy/src/{client,host}` 与 `tests/`。

| # | 问题 | 改动 | 实测证据 |
|---|---|---|---|
| 1 | Composer 工作空间切换"没反应" | `features/conversation/{Chat.tsx,store.ts}`：新增 `sessionLocked()`；`currentWorkspace` 在未锁定时优先 `pickedWs`；`pickWorkspace` 只续备（不再立即 connect）；`send` 对 blank 会话重定向到已选 workspace；已开始会话渲染 `StatusPill` 锁态（title 已锁定说明） | 已开始会话锁态 pill 出现（title=锁定说明）；blank 页选工作空间后 chip 立即从 `Docs` 变 `GPT-Image2分享` |
| 2 | 文件预览支持图片/视频 | `host.js` 新增 `deepbuddyFiles/readBinary` 端点（`fs.readBytes` 围栏读取、base64、`previewMaxBytes` 50MB 上限）；`files.ts` `readBinary` wire；`FilesView.tsx` 按扩展名分派 `MediaPreview`（`<img>`/`<video>`、blob URL、unmount revoke）；`files/store.ts` `mediaBodies` + `openBinaryFile` | 点击 `.png` 渲染 `blob:` URL 的 `<img>`；`readBinary` RPC 实测返回正确 base64，解码=文件内容 |
| 3 | 模式弹层被底部裁掉 | `ui/kit.tsx` Popover 加 `useLayoutEffect` 视口测量，下方放不下自动翻成 up | 420px 视口工作空间弹层 `upCount:1 down:0`（翻上）；够放时保持 down |
| 4 | 右列关闭主列占满宽度 | `Chat.tsx` `COLUMN` 改为 `columnStyle(dockOpen)`；`ChatView` 读 `layout.state.dock` 传入 | dock 关 composer 宽 1107px，dock 开 444px（仍 720 居中） |
| 5 | 空白新会话页 composer 居中 | `ChatView` blank 分支：Hero+Composer 一组垂直居中；首条消息后切常规布局 | 空态 composer top=463/900≈51%（居中） |
| 6 | 会话打开失败被静默渲染空白页 | `Stream` 在 `openState==='error'` 渲染错误卡片（`会话历史无法加载` + `openError` 文案），loading/cold 保持"加载会话…" | 打开「研究DeepSeek-Harness插件开发」显示错误卡片 |

## 验证（全绿）

```sh
pnpm build && pnpm typecheck && pnpm test   # deepbuddy 50 条（原 45+新增 5）全绿；terminal-probe 5 条全绿
node scripts/sync-upstream.mjs --smoke       # 4 PASS（首次 2 项 404 为已知启动竞态，复跑即绿）
```

浏览器实测：300s 超时 headless Chrome 不可用；改用 `/Users/byron/.npm/_npx/3c7a546e8f4df377/node_modules/puppeteer-core`（npx 缓存）驱动 Chrome `headless:'new'` in `/tmp/dbdy-verify*.mjs`（脚本已删）。六项全部点验通过，控制台零 error。

## 关键约束/教训

- **3081 服务器**：原用户实例（PID 9604）被重启以加载新 bundle；现由 `dsh --profile deepbuddy --port 3081`（本会话 hub 进程）托管，**已在跑**，供真机验证。
- **chrome-devtools-mcp 浏览器被另一会话（s013）锁定**：`browser 'already running ... use --isolated'`，无法复用；用 puppeteer-core 独立实例绕过。
- 新增端点/测试断言从"两个端点"改"三个端点"（`plugin.test.mjs`、`host.test.mjs`）；host 新增 `readBinary` 描述块与 fenced/too-large/malformed 用例。
- `host.js` 的 `resolveWorkspaceDirectory` 被我在编辑中误删过一次，已原样恢复（内容未变，仅位置前移）。

## 复测入口

```sh
node_modules/.bin/dsh --profile deepbuddy --port 3081   # 浏览器 http://127.0.0.1:3081
pnpm --filter dsh-plugin-deepbuddy build && pnpm --filter dsh-plugin-deepbuddy test
```
