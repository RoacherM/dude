/**
 * The distribution's design tokens, and the few rules inline styles cannot
 * carry (hover tints, focus rings, keyframes, scrollbars, the overlay layer).
 *
 * Values are the Synara handoff's final numbers
 * (`design/synara/design_handoff_dsh_desktop/README.md` §Design Tokens and
 * `COMPONENTS.md`), transcribed verbatim rather than approximated: the handoff
 * is high-fidelity, so every colour, radius and duration here is a pixel
 * decision someone already made.
 *
 * Three disciplines the token set exists to enforce (they are what separates
 * this from a palette swap — see `design/STUDY-synara.md`):
 *
 * 1. **Separation is material, not line.** `--db-fill-*` carry the weight;
 *    `--db-line` is 5% white and is reserved for STRUCTURAL seams (column to
 *    column, top bar to body, composer outline, popover outline). Row- and
 *    card-level borders are not drawn.
 * 2. **Hierarchy is opacity, not weight.** Five text steps, one 600 weight
 *    used only for the wordmark, the hero line and dialog titles. No
 *    uppercase micro-labels, no letter-spacing tricks.
 * 3. **Accent belongs to state.** `--db-run` / `--db-await` / `--db-primary`
 *    mark running, awaiting-approval and the single primary action on screen.
 *    Nothing decorative is coloured.
 *
 * Everything is scoped under `.dbdy` so the stock shell's `--dsw-*` theme and
 * these tokens never fight.
 */

/** Column and content metrics shared by the CSS and the layout arithmetic. */
export const METRICS = {
  /** Every column draws its own top bar at this height. */
  topbar: 52,
  /** macOS traffic-light reservation at the window's left edge. */
  traffic: 88,
  /** Sidebar width; it collapses to 0 rather than to an icon rail. */
  sidebar: 268,
  /** Conversation content column — centered; 720px with the dock open, 880px with it closed. */
  chatColumn: 720,
  /** Conversation content column with the dock closed — centered, wider, never full-bleed. */
  chatColumnWide: 880,
  /** Settings content column (within the settings dialog). */
  settingsColumn: 820,
  /** Command palette width. */
  palette: 560,
} as const

const CSS = `
.dbdy {
  /* ── grounds ─────────────────────────────────────────────────────────── */
  --db-window: #0f0f0f;
  --db-rail: #0a0a0a;
  --db-popover: #181818;
  --db-dialog: #161616;

  /* ── surface fills: white over the ground, card → hover → selected ───── */
  --db-fill-1: rgba(255, 255, 255, .022);
  --db-fill-2: rgba(255, 255, 255, .028);
  --db-fill-3: rgba(255, 255, 255, .035);
  --db-fill-4: rgba(255, 255, 255, .06);
  --db-fill-5: rgba(255, 255, 255, .07);
  --db-fill-6: rgba(255, 255, 255, .09);

  /* ── text: the whole hierarchy, weight stays 400 ─────────────────────── */
  --db-text: #ededed;
  --db-text-2: #b4b4b4;
  --db-text-3: #7a7a7a;
  --db-text-4: #6f6f6f;
  --db-text-5: #5f5f5f;

  /* ── strokes: structure / container / input / emphasis / focus ───────── */
  --db-line: rgba(255, 255, 255, .05);
  --db-line-card: rgba(255, 255, 255, .08);
  --db-line-container: rgba(255, 255, 255, .09);
  --db-line-input: rgba(255, 255, 255, .10);
  --db-line-input-2: rgba(255, 255, 255, .14);
  --db-line-emphasis: rgba(255, 255, 255, .16);
  --db-line-focus: rgba(255, 255, 255, .24);
  --db-line-hover: rgba(255, 255, 255, .26);
  --db-line-dashed: rgba(255, 255, 255, .14);

  /* ── semantics: the only colours on screen ───────────────────────────── */
  --db-run: #10b981;
  --db-run-soft: #34d399;
  --db-run-wash: rgba(16, 185, 129, .14);
  --db-await: #d97757;
  --db-await-wash: rgba(217, 119, 87, .13);
  --db-primary: #4d6bfe;
  --db-offline: #8b8b8b;

  /* ── type ────────────────────────────────────────────────────────────── */
  --db-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", sans-serif;
  --db-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  /* ── radii: pills take half their height, everything else is listed ──── */
  --db-r-badge: 6px;
  --db-r-chip: 8px;
  --db-r-swatch: 10px;
  --db-r-row: 11px;
  --db-r-input: 14px;
  --db-r-card: 15px;
  --db-r-surface: 16px;
  --db-r-editor: 18px;

  /* ── motion ──────────────────────────────────────────────────────────── */
  --db-in: 140ms ease-out;
  --db-size: 180ms ease;
  --db-tint: 120ms ease;

  /* ── elevation ───────────────────────────────────────────────────────── */
  --db-shadow-popover: 0 22px 54px rgba(0, 0, 0, .68);
  --db-shadow-menu: 0 24px 60px rgba(0, 0, 0, .70);
  --db-shadow-dialog: 0 32px 80px rgba(0, 0, 0, .74);

  color-scheme: dark;
}

.dbdy, .dbdy * { box-sizing: border-box; }
.dbdy button { font-family: var(--db-font); color: inherit; }
.dbdy input, .dbdy textarea { font-family: var(--db-font); color: inherit; }
.dbdy input::placeholder, .dbdy textarea::placeholder { color: var(--db-text-4); }

/* Scrollbars read as material, not as a control: no track, thumb only, and
   it stays inside the 5–9% stroke band so a scrolling column does not grow a
   bright edge. */
.dbdy ::-webkit-scrollbar { width: 10px; height: 10px; }
.dbdy ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, .09); border-radius: 999px; border: 3px solid transparent; background-clip: content-box; }
.dbdy ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, .16); background-clip: content-box; }
.dbdy ::-webkit-scrollbar-track { background: transparent; }
.dbdy ::-webkit-scrollbar-corner { background: transparent; }

.dbdy :focus { outline: none; }
.dbdy :focus-visible { outline: 2px solid var(--db-primary); outline-offset: 2px; }
.dbdy ::selection { background: rgba(77, 107, 254, .35); }

/* ── hover tints: the one thing inline styles cannot express ───────────── */
.dbdy-hv-1:hover { background: var(--db-fill-2) !important; }
.dbdy-hv-2:hover { background: var(--db-fill-4) !important; }
.dbdy-hv-3:hover { background: var(--db-fill-5) !important; }
/* Icon buttons brighten their glyph as well as their ground. */
.dbdy-hv-icon:hover { background: var(--db-fill-5) !important; color: var(--db-text) !important; }
/* Outline controls: fill AND raise the stroke, per COMPONENTS.md. */
.dbdy-hv-outline:hover { background: var(--db-fill-5) !important; border-color: var(--db-line-hover) !important; }
.dbdy-hv-text:hover { color: var(--db-text) !important; }
.dbdy-hv-primary:hover { filter: brightness(1.08); }

/* Rows that reveal their actions on hover: the resting metadata fades out and
   the action bar takes the same slot, so nothing reflows (STUDY §8.7). The
   fading element must also stop taking pointer events, or it keeps eating the
   clicks meant for the actions underneath it. */
.dbdy-row .dbdy-rest { opacity: 1; transition: opacity var(--db-tint); }
.dbdy-row .dbdy-act { opacity: 0; pointer-events: none; transition: opacity var(--db-tint); }
.dbdy-row:hover .dbdy-rest { opacity: 0; pointer-events: none; }
.dbdy-row:hover .dbdy-act { opacity: 1; pointer-events: auto; }

/* ── motion ────────────────────────────────────────────────────────────── */
@keyframes dbdy-pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
@keyframes dbdy-pop-up { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes dbdy-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes dbdy-pulse { 0% { opacity: 1; } 50% { opacity: .3; } 100% { opacity: 1; } }

.dbdy-pop { animation: dbdy-pop var(--db-in); }
.dbdy-pop-up { animation: dbdy-pop-up var(--db-in); }
.dbdy-fade { animation: dbdy-fade var(--db-in); }
.dbdy-pulse { animation: dbdy-pulse 1.1s ease-in-out infinite; }

/* The frame contract's 'shell.overlay' layer: above every column, outside
   their scroll containers, and click-through — an entry opts back into
   pointer events, exactly as the official frame's layer does. Above the
   drop-ups (30) and below the modal layer (60), so a floating ecosystem
   surface covers the app but never a dialog. */
.dbdy-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  pointer-events: none;
}
.dbdy-overlay > * { pointer-events: auto; }
`

/**
 * Install the stylesheet.
 * @returns disposer removing the style element (rides the plugin fiber).
 */
export function installStyles(): () => void {
  const el = document.createElement('style')
  el.dataset['owner'] = 'dsh-plugin-deepbuddy'
  el.textContent = CSS
  document.head.append(el)
  return () => { el.remove() }
}
