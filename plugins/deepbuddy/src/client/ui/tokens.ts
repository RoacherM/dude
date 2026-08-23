/**
 * The distribution's design tokens, and the few rules inline styles cannot
 * carry (hover tints, focus rings, keyframes, scrollbars, the overlay layer).
 *
 * UI-unify (wave): every `--db-*` value now references the harness's official
 * `--dsw-*` / `--ds-*` variables (injected by the enabled ui-conversation /
 * ui-layout rows) with a hardcoded fallback, so DeepBuddy's sidebar and dock
 * share the official main column's palette instead of a parallel Synara set.
 * The values were reverse-engineered from the official web profile (port 3080)
 * via getComputedStyle — the alias names were read off the live DOM, not
 * guessed from names.
 *
 * Three disciplines the token set exists to enforce (they are what separates
 * this from a palette swap — see `design/STUDY-synara.md`):
 *
 * 1. **Separation is material, not line.** `--db-fill-*` carry the weight;
 *    `--db-line` is reserved for STRUCTURAL seams (column to column, top bar
 *    to body, composer outline, popover outline). Row- and card-level borders
 *    are not drawn.
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
  /* ── grounds: official main frame / sidebar / menu / panel ─────────────── */
  --db-window: var(--dsw-alias-bg-base, #151517);
  --db-rail: var(--dsw-specific-sidebar-fill, #1b1b1c);
  --db-popover: var(--dsw-specific-menu, #353638);
  --db-dialog: var(--dsw-specific-menu, #2c2c2e);

  /* ── surface fills: card → hover → selected ───────────────────────────── */
  --db-fill-1: color-mix(in srgb, var(--dsw-alias-interactive-bg-hover, #ffffff14) 40%, transparent);
  --db-fill-2: var(--dsw-alias-interactive-bg-hover, #ffffff14);
  --db-fill-3: color-mix(in srgb, var(--dsw-alias-interactive-bg-hover, #ffffff14) 140%, transparent);
  --db-fill-4: var(--dsw-alias-interactive-bg-active, #ffffff24);
  --db-fill-5: color-mix(in srgb, var(--dsw-alias-interactive-bg-active, #ffffff24) 130%, transparent);
  --db-fill-6: color-mix(in srgb, var(--dsw-alias-interactive-bg-active, #ffffff24) 160%, transparent);

  /* ── text: official primary / secondary / tertiary / caption + a dimmer ── */
  --db-text: var(--dsw-alias-label-primary, #f9fafb);
  --db-text-2: var(--dsw-alias-label-secondary, #cfd3d6);
  --db-text-3: var(--dsw-alias-label-tertiary, #adb2b8);
  --db-text-4: var(--dsw-alias-label-caption, #81858c);
  --db-text-5: color-mix(in srgb, var(--dsw-alias-label-caption, #81858c) 78%, transparent);

  /* ── strokes: official border tiers ────────────────────────────────────── */
  --db-line: var(--dsw-alias-border-l1, #ffffff0f);
  --db-line-card: var(--dsw-alias-border-l1, #ffffff0f);
  --db-line-container: var(--dsw-alias-border-l2, #ffffff1f);
  --db-line-input: var(--dsw-alias-border-l2, #ffffff1f);
  --db-line-input-2: var(--dsw-alias-border-l3, #ffffff29);
  --db-line-emphasis: var(--dsw-alias-border-l3, #ffffff29);
  --db-line-focus: var(--dsw-alias-border-l4, #fff3);
  --db-line-hover: var(--dsw-alias-interactive-bg-active, #ffffff24);
  --db-line-dashed: var(--dsw-alias-border-l2, #ffffff1f);

  /* ── semantics: the only colours on screen ─────────────────────────────── */
  --db-run: var(--dsw-alias-state-success-primary, #22c55e);
  --db-run-soft: color-mix(in srgb, var(--dsw-alias-state-success-primary, #22c55e) 80%, var(--dsw-alias-label-primary, #f9fafb));
  --db-run-wash: color-mix(in srgb, var(--dsw-alias-state-success-primary, #22c55e) 14%, transparent);
  --db-await: var(--dsw-alias-state-warning-primary, #d97757);
  --db-await-wash: color-mix(in srgb, var(--dsw-alias-state-warning-primary, #d97757) 13%, transparent);
  --db-primary: var(--dsw-alias-state-business-primary, #679efe);
  --db-offline: var(--dsw-alias-label-caption, #81858c);

  /* ── type ──────────────────────────────────────────────────────────────── */
  --db-font: var(--dsw-font-family);
  --db-mono: var(--ds-font-family-code);

  /* ── radii: official row 8px, cards/pills 22px / 999px ─────────────────── */
  --db-r-badge: 8px;
  --db-r-chip: 8px;
  --db-r-swatch: 10px;
  --db-r-row: 8px;
  --db-r-input: 14px;
  --db-r-card: 22px;
  --db-r-surface: 22px;
  --db-r-editor: 22px;

  /* ── motion: official transition durations / ease ──────────────────────── */
  --db-in: var(--ds-transition-duration-fast, 0.1s) var(--ds-ease-in-out, cubic-bezier(.4, 0, .2, 1));
  --db-size: var(--ds-transition-duration-normal, 0.2s) var(--ds-ease-in-out, cubic-bezier(.4, 0, .2, 1));
  --db-tint: var(--ds-transition-duration-fast, 0.1s) var(--ds-ease-in-out, cubic-bezier(.4, 0, .2, 1));

  /* ── elevation ─────────────────────────────────────────────────────────── */
  --db-shadow-popover: 0 22px 54px rgba(0, 0, 0, .68);
  --db-shadow-menu: 0 24px 60px rgba(0, 0, 0, .70);
  --db-shadow-dialog: 0 32px 80px rgba(0, 0, 0, .74);

  color-scheme: dark;
}

.dbdy, .dbdy * { box-sizing: border-box; }
.dbdy button { font-family: var(--db-font); color: inherit; }
.dbdy input, .dbdy textarea { font-family: var(--db-font); color: inherit; }
.dbdy input::placeholder, .dbdy textarea::placeholder { color: var(--db-text-4); }

/* Scrollbars: official dsw scrollbar tiers — thumb only, 8px, l2 thumb / l2
   hover. */
.dbdy ::-webkit-scrollbar { width: 8px; height: 8px; }
.dbdy ::-webkit-scrollbar-thumb { background: var(--dsw-alias-scrollbar-bg-l2, #545557); border-radius: 999px; border: 2px solid transparent; background-clip: content-box; }
.dbdy ::-webkit-scrollbar-thumb:hover { background: var(--dsw-alias-scrollbar-hover-l2, #65676b); background-clip: content-box; }
.dbdy ::-webkit-scrollbar-track { background: transparent; }
.dbdy ::-webkit-scrollbar-corner { background: transparent; }

.dbdy :focus { outline: none; }
.dbdy :focus-visible { outline: 2px solid var(--db-primary); outline-offset: 2px; }
.dbdy ::selection { background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #679efe) 35%, transparent); }

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
.dbdy-pulse { animation: dbdy-pulse 1.1s var(--ds-ease-in-out, cubic-bezier(.4, 0, .2, 1)) infinite; }

/* ── window drag opt-outs ──────────────────────────────────────────────── */
/* Interactive elements opt out of window-drag regions (the column top bars
   and the main column's drag strip). Unscoped on purpose: Electron collects
   app-region rects viewport-globally, so a surface PORTALED outside .dbdy —
   the official settings dialog — floats over the drag strips and its
   controls would drag the window instead of answering clicks. Inert outside
   Electron — browsers ignore app-region. */
button, a, input, textarea, select,
[role="tab"], [role="button"], [role="menuitem"],
[contenteditable], [role="dialog"] {
  -webkit-app-region: no-drag;
}

/* ── hero headline animation ───────────────────────────────────────────── */
/* The official hero's static headline + preview badge give way to the
   DeepBuddy brand slot's animated headline (dsh/adapter.ts). Their class
   names carry a build hash prefix, so the match is on the stable semantic
   suffix; officials are locked at 0.1.1-rc.2, revisit on upgrade. */
.dbdy div[class*="_headline"] > span[class*="_headlineText"],
.dbdy div[class*="_headline"] > span[class*="_previewBadge"] { display: none; }

/* The official session-log export button cedes its right-edge header spot to
   DeepBuddy's dock toggle (app/App.tsx registers it into the same utilities
   cluster). Same hash-prefix caveat as above. */
.dbdy button[class*="_sessionLogButton"] { display: none; }

/* The official session header stacks 12px padding + a 32px title row + the
   view tabs, so its title floats 2px below the neighbours' and its bottom
   edge lands at 76px while every other column rules off at 52px. Reshape it
   to the shell's two-tier pattern (the inspector's top bar + tab strip): the
   title row becomes the aligned 52px bar with the full-bleed rule, the tabs
   a strip below it. Same hash-prefix caveat as above. */
.dbdy header[class*="_header"] { padding-top: 0; }
.dbdy header[class*="_header"] > div[class*="_titleRow"] {
  min-height: 52px;
  margin: 0 -28px 0 -20px;
  padding: 0 28px 0 20px;
  border-bottom: 1px solid var(--db-line);
}
.dbdy header[class*="_header"] > div[class*="_titleRow"] + [class*="_tabs"] { margin-top: 10px; }

/* One character per span, popping in sequence and waving out; fill-mode
   backwards keeps a char invisible through its stagger delay. */
.dbdy-hero-char {
  display: inline-block;
  animation: dbdy-hero-char-pop 3.8s cubic-bezier(.2, .9, .3, 1.2) infinite;
  animation-fill-mode: backwards;
}
@keyframes dbdy-hero-char-pop {
  0% { opacity: 0; transform: translateY(10px) scale(.3); }
  6% { opacity: 1; transform: translateY(-2px) scale(1.12); }
  9% { transform: translateY(0) scale(1); }
  80% { opacity: 1; transform: none; }
  90% { opacity: 0; transform: translateY(-6px); }
  100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .dbdy-hero-char { animation: none; }
}

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
 * @param extra - additional CSS appended after the tokens (the font-face
 * block lives in ui/fonts.ts so this module stays loadable under plain Node).
 * @returns disposer removing the style element (rides the plugin fiber).
 */
export function installStyles(extra = ''): () => void {
  const el = document.createElement('style')
  el.dataset['owner'] = 'dsh-plugin-deepbuddy'
  el.textContent = CSS + extra
  document.head.append(el)
  return () => { el.remove() }
}
