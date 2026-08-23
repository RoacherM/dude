/**
 * The distribution's typeface: Departure Mono (departuremono.com, Helena
 * Zhang, OFL-1.1), vendored as an inlined woff2. Kept out of tokens.ts so the
 * geometry/preset tests can import that module under plain Node, which cannot
 * load a .woff2 import (esbuild inlines it as a data URL at bundle time).
 *
 * The whole app funnels its typography through the two official variables
 * overridden below (plus body's own font-family), so this re-fonts the
 * official main column and the DeepBuddy shell together. Latin/ASCII renders
 * in the pixel face; CJK falls through to the official stack behind it.
 */
import departureMonoUrl from '../assets/departure-mono.woff2'

export const FONT_CSS = `
@font-face {
  font-family: "Departure Mono";
  src: url(${departureMonoUrl}) format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

:root {
  --dsw-font-family: "Departure Mono", -apple-system, "system-ui", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --ds-font-family-code: "Departure Mono", "SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, monospace;
}
body { font-family: var(--dsw-font-family); }
`
