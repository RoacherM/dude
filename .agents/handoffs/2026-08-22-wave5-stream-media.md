# wave5 流式双显示 + 停靠栏默认宽度 + 视频预览上限 + 设置弹层固定尺寸 handoff

- 日期 / agent：2026-08-22 / claude
- 目标：执行用户实测三轮反馈的四项现场修复，逐项浏览器实测。
- git 基线：`b277306`。**未 commit**。

## 已完成（四项，全部浏览器实测通过）

基线 `b277306`；改动集中在 `plugins/deepbuddy/src/`（client + host）与 `tests/` 与 `DESIGN_INTENT.md`。

| # | 需求 | 改动 | 实测证据 |
|---|---|---|---|
| 1 | 流式输出双显示（bug） | `conversation/Chat.tsx` `Stream`：`hasChat` 时**不再**渲染 `conv.runningCalls`/`partialBlocks`（chat 快照 `renderChatNodes` 已含运行中 step/tool-call），新增 `showLiveTail = !hasChat` 只放行 legacy 路径；「正在思考…」移入 chat 感知的 `chatHasVisibleRunning()`（扫描 chat 快照的 running assistant-step 可见 blocks / running tool-call，无则显示） | 真实会话发消息，流式全程 16 帧采样：`reasonBlocks` 无重复、无 >30 字符叶子文本块重复；t=1 显示「正在思考…」，t=2 后渲染 reasoning 块（均各只出现一次） |
| 2 | 停靠栏默认宽度太大 | `shell/geometry.ts` `DOCK_DEFAULT_RATIO` 0.46→0.30；geometry 注释同步；`DESIGN_INTENT.md` §2 基线表「右列默认宽度」46%→30%；`tests/plugin.test.mjs` geometry 断言 `dockDefault(1440,269)=round(1440*0.30)=432` | 1440×900 实测 dock 列 `flex-basis: 432px`（改前应是 662px）；30%–70% 拖拽范围与 416px 最小宽不变；50 条+2 条测试全绿 |
| 3 | 60MB 视频被「文件过大」拦下 → **HTTP 路由方案** | `host.js`：inject 追加 `webServer`；新增 `MEDIA_ROUTE='/deepbuddy/media'`；`apply` 内 `webServer.register({kind:'prefix'})` 注册路由；`streamMedia()` 用 `createReadStream` 流式伺服 fenced 文件（`resolveWorkspaceFile` 重新围栏），支持单 Range（206 + Content-Range）与 416；`mediaMime()` 按扩展名给 MIME；`readBinary` 当 webServer 在场时返回 `{kind:'url', url}`（origin 相对路径），否则回退 capped base64。`dsh/files.ts` `ReadBinaryResult` 增加 `{kind:'url'}`；`files/store.ts` `openBinaryFile` 对 url 直接 `new URL(r.url, window.location.origin)` 交 `<video>/<img>`，不回退 blob/base64。`host.test.mjs` 补 2 条 media URL 断言；`plugin.test.mjs` 更新 inject & get | RPC 实测：`readBinary` 返回 `/deepbuddy/media/<sessionId>/<encoded-path>`；FULL GET `200` `video/mp4` `Accept-Ranges: bytes` `Content-Length: 66252048`；RANGE GET `206` `Content-Range: bytes 0-1023/66252048`；注入 `<video>` 实测 63MB（66,252,048B）mp4 播放 `currentTime: 2.6→2.03`、`paused:false`、`duration:75.0s`、`readyState:4`（HAVE_ENOUGH_DATA）。「文件过大」路径保留给无 webServer 的兜底部署 |
| 4 | 设置弹层切页位置/尺寸跳动（追加项） | `features/settings/SettingsApp.tsx` `SettingsDialog`：`KIT.Dialog` style 由 `width:min(1200px,90vw)` `maxHeight:min(860px,90vh)` 改为 `width:min(1200px,90vw)` + **`height:min(860px,90vh)`**（固定高，替代内容自适应）；内容区内部滚动（`SettingsApp` 的 overflow auto 不变） | 1440×900：模式页 / 插件页 / 切回模式 三次 `x:120,y:45,w:1200,h:810` **像素级一致**（`STABLE mode↔plugins:true`）。宽=min(1200,90vw=1296)=1200，高=min(860,90vh=810)=810 |

## 验证（全绿）

```sh
pnpm build && pnpm typecheck && pnpm test
# deepbuddy 52 条全绿（含 geometry 30% 断言 + 新增 2 条 media URL 测试）；
# terminal-probe 5 条全绿。
```

浏览器实测（puppeteer-core + Chrome headless，端口 3082）：流式双显示、dock 30%、63MB mp4 播放、设置弹层固定尺寸 四项全部通过；控制台/pageerror 零错误。
服务器 `dsh --profile deepbuddy --port 3082` 由本会话 hub 进程托管（`dbdy-wave5`），**已停**。

## 关键决策/约束

- **媒体走 HTTP 路由（首选方案），不是分档上限**：`@deepseek-ai/dsh-host-webserver` 的 `webServer.register({kind:'prefix'})` 在 deepbuddy web/desktop profile 中存在且已监听（桌面 main.js 以 `http://127.0.0.1:<port>` 加载）。`fs.processPath(target)` 返回 node:fs 可读的 realpath，所以用 `createReadStream` 支持 Range 流式。查证证据：`dsh --profile deepbuddy --dump-config` 输出含 `webserver (@deepseek-ai/dsh-host-webserver)`；`dsh-web-app` 的 inject 就是 `['webServer']`，`registerFallback`/`register`（exact/prefix，handler 拥有完整响应生命周期）在类型里清晰声明。
- **url 是 origin 相对路径**（`host.mediaUrl` 返回 `/deepbuddy/media/...`），浏览器侧 `new URL(url, window.location.origin)` 补全——切 LAN IP / loopback 都稳，且不依赖 host 硬编码。
- **路径围栏在路由下发时重复做一遍**：URL 里的 path 用 `encodeURIComponent`（`/` → `%2F`），路由 handler 按 `/` 切段再 `decodeURIComponent`，join 回原绝对路径后走 `resolveWorkspaceFile` 重新围栏（symlink 也跟），所以 URL 无法越权读 session 外文件。session id 同样编码。
- **`host.js` 改动后需重启验证服务**才加载新 host 代码（task 纪律），本会话已重启 `dbdy-wave5` 并复测 63MB 播放通过。
- **`readBinary` 的 `{kind:'url'}` 与 `{kind:'binary'}` 并存**：无 webServer 的部署（headless/file://）走 capped base64 兜底，行为不变；web/desktop 走 URL，50MB 上限自然不再触发。
- **`KIT.Dialog` 的 `style` 会覆盖基座 maxHeight（82vh）**：传 `height` 时同时给 `maxHeight` 相同值，避免 flex 子项被 82vh 上界截断；低视口下 `height:min(860px,90vh)` 仍让内容内部滚动，面板四边不动。
- **`MediaPreview` 卸载 `URL.revokeObjectURL(url)` 对 HTTP URL 是安全 no-op**（revoke 非 blob URL 不报错、无副作用），无需分支。

## 复测入口

```sh
node_modules/.bin/dsh --profile deepbuddy --port 3082   # 浏览器 http://127.0.0.1:3082
pnpm --filter dsh-plugin-deepbuddy build && pnpm --filter dsh-plugin-deepbuddy test
# 63MB 实测：session-5d1171f7(...) 其 cwd=~/Desktop/GPT-Image2分享；
# POST /api/deepbuddyFiles/readBinary {args:{request:{sessionId, path:/Users/byron/Desktop/GPT-Image2分享/鬼市迷影_7月7日_v2.mp4}}}
```

## 未完成 / 下一步

- 无阻塞项。`reports/restructure/` 是既有未跟踪目录，非本波产物。
- 可选后续：把「文件过大」兜底文案带上实际上限数值（当前兜底路径在 web 部署已不再触发，仅在无 webServer 部署出现；现文案显示 `文件过大 · N.MB` 为文件实际大小，未标上限）。
