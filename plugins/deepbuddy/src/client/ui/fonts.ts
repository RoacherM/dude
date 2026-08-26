/**
 * The distribution's typefaces, vendored as inlined woff2. Kept out of
 * tokens.ts so the geometry/preset tests can import that module under plain
 * Node, which cannot load a .woff2 import (esbuild inlines it as a data URL
 * at bundle time).
 *
 * Visual v2 splits the two jobs a typeface was doing at once:
 *
 * - **Body is Archivo** (Omnibus Type, OFL-1.1; the latin variable subset
 *   Google Fonts serves at v25, `font-weight: 100 900`). Chinese falls
 *   through to PingFang SC and the rest of the system stack.
 * - **The pixel face is a brand mark only.** Departure Mono
 *   (departuremono.com, Helena Zhang, OFL-1.1) now reaches exactly two
 *   places through `--db-brandfont` (ui/tokens.ts): the sidebar wordmark and
 *   the hero wordmark. It is no longer the UI's body face, so the CJK pixel
 *   companion it needed (fusion-pixel-font, 645KB) is gone with it.
 * - **Code is the system mono stack** — paths, model ids, the terminal, the
 *   file tree. No webfont: a code face that is also the brand face made both
 *   jobs worse.
 *
 * The whole app funnels its typography through the two official variables
 * overridden below (plus body's own font-family), so this re-fonts the
 * official main column and the DeepBuddy shell together.
 */
import archivoUrl from '../assets/archivo-latin.woff2'
import departureMonoUrl from '../assets/departure-mono.woff2'

export const FONT_CSS = `
@font-face {
  font-family: "Archivo";
  src: url(${archivoUrl}) format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Departure Mono";
  src: url(${departureMonoUrl}) format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

:root {
  --dsw-font-family: "Archivo", -apple-system, "system-ui", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --ds-font-family-code: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}
body { font-family: var(--dsw-font-family); }
`
