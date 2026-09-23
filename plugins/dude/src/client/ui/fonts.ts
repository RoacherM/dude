/**
 * The body typeface, Archivo (Omnibus Type, OFL-1.1; the latin variable
 * subset, `font-weight: 100 900`), vendored as an inlined woff2. Chinese
 * falls through to PingFang SC and the system stack; code uses the system
 * mono stack. The official app reads its typography from the two variables
 * overridden below, so this re-fonts the whole window.
 */
import archivoUrl from '../assets/archivo-latin.woff2'

export const FONT_CSS = `
@font-face {
  font-family: "Archivo";
  src: url(${archivoUrl}) format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

:root {
  --dsw-font-family: "Archivo", -apple-system, "system-ui", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --ds-font-family-code: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}
body { font-family: var(--dsw-font-family); }
`
