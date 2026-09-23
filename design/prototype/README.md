# Dude 交互原型（历史视觉参考）

> 状态：**历史视觉参考，不约束实现，不再迭代。** Dude 的界面全部是官方 `dsh-web-app`，
> 没有自绘 UI 需要先在原型上验证；现行设计以 `../ARCHITECTURE.md` 与
> `../DESIGN_INTENT.md` 为准。

## 是什么

Dude 还在自绘三列界面时做的高保真、可交互、零依赖原型：

- `index.html` — 单文件原型（内嵌 CSS / SVG 图标 / vanilla JS / 假数据），平铺满屏
  版本：竖线工作流、可折叠的步骤摘要、1px seam-line 分隔三列。
- `index-v2-floating.html` — 更早的浮岛版本。
- `fonts.css` — 原型用的 base64 @font-face；file:// 页面看不到应用内嵌字体，必须和
  html 一起分发，缺了会退化成系统字体。

直接用浏览器打开：

```bash
open design/prototype/index.html
```

## 与现行界面的差别

- 布局：原型是自绘三列，停靠栏有文件 / 终端 / 浏览器；现行界面是官方 `ui-layout`，
  右栏是官方 dockkit，锁定版本（0.1.5-rc.2）只有 Files 页，终端和浏览器等升级到 0.1.6。
- 视觉：原型的配色、字体、竖线工作流、气泡样式和 Hero 标识都是当时的重设计稿；现行
  界面一律用官方样式，Dude 只加窗口拖拽区域和 Hero 胖蓝鱼（`../DESIGN_INTENT.md`）。
- 原型里的控件大多是假数据和 toast 占位，不代表现行功能。

## 参考资料

- 原型采集自真实 app 的结构尺寸与截图：`.agents/reference/proto-ref/`。
- 原型迭代记录：`.agents/handoffs/2026-08-24-html-prototype.md`。

内联脚本语法自查：

```bash
node -e 'const fs=require("fs");const h=fs.readFileSync("design/prototype/index.html","utf8");new Function(h.slice(h.indexOf("<script>")+8,h.lastIndexOf("</script>")));console.log("inline JS parse: PASS")'
```
