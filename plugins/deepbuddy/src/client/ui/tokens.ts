/**
 * The distribution's design tokens, and the few rules inline styles cannot
 * carry (hover tints, focus rings, keyframes, scrollbars, the overlay layer).
 *
 * UI-unify (wave): most `--db-*` values reference the harness's official
 * `--dsw-*` / `--ds-*` variables (injected by the enabled ui-conversation /
 * ui-layout rows) with a hardcoded fallback, so DeepBuddy's sidebar and dock
 * share the official main column's palette instead of a parallel Synara set.
 * The values were reverse-engineered from the official web profile (port 3080)
 * via getComputedStyle — the alias names were read off the live DOM, not
 * guessed from names.
 *
 * Visual v2 (浮岛 + Archivo) breaks that chain for one family of roles, on
 * purpose: the floating-island frame needs a WINDOW GROUND darker than any
 * panel (`--db-window`), a panel ground the three columns share
 * (`--db-panel`), an embedded black for terminals and previews
 * (`--db-void`), a raised step inside a panel (`--db-raised`), a brand red
 * that is not a state colour (`--db-brand`), a hairline for the island
 * outline (`--db-line-panel`) and a radius ladder at 20/24/14/16/12/10/9.
 * The official palette has no such roles and no such radii, so those tokens
 * carry literals — a chain there would resolve to the wrong thing, not to a
 * near-enough thing. Everything that CAN keep following the official palette
 * still does (text, lines, fills, run / await / primary): the fallbacks
 * below were refreshed to the v2 values, but the official variable still
 * wins, which is also what keeps the light theme working
 * (dsh/theme-presenter.ts).
 *
 * Three disciplines the token set exists to enforce (they are what separates
 * this from a palette swap — see `design/DESIGN_INTENT.md` §10):
 *
 * 1. **Separation is material, not line.** `--db-fill-*` carry the weight;
 *    `--db-line` is reserved for STRUCTURAL seams (top bar to body, composer
 *    outline, popover outline) and column-to-column separation is the 10px
 *    window ground showing through. Row- and card-level borders are not
 *    drawn.
 * 2. **Hierarchy is opacity, not weight.** Five text steps, one 600 weight
 *    used only for the wordmark, the hero line and dialog titles. No
 *    uppercase micro-labels, no letter-spacing tricks.
 * 3. **Accent belongs to state.** `--db-run` / `--db-await` / `--db-primary`
 *    mark running, awaiting-approval and the single primary action on screen.
 *    `--db-brand` marks identity and nothing else — the one red square beside
 *    the sidebar wordmark. Selection is fill, never colour.
 *
 * Everything is scoped under `.dbdy` so the stock shell's `--dsw-*` theme and
 * these tokens never fight.
 */
import { dbwarn } from '../log.ts'

/** Column and content metrics shared by the CSS and the layout arithmetic. */
export const METRICS = {
  /** Every column draws its own top bar at this height. */
  topbar: 52,
  /**
   * The floating-island gap: window padding, column seam and drag-handle
   * width are the same 10px. It lives here and not only in CSS because the
   * dock arithmetic has to subtract it (shell/geometry.ts).
   */
  gap: 10,
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
  /* ── grounds (unchained): the island stack ─────────────────────────────── */
  /* Window ground is the deepest layer and IS the seam between columns; the
     three columns are同色 panels floating on it, so nothing here can borrow
     the official base/sidebar pair — that pair distinguishes rail from frame,
     which v2 explicitly refuses to do. */
  --db-window: #0b0b0c;
  --db-panel: #151517;
  --db-raised: #1c1c1f;
  --db-void: #0e0e10;
  --db-rail: var(--db-panel);
  --db-popover: #1f1f23;
  --db-dialog: #171719;
  --db-gap: ${METRICS.gap}px;

  /* ── surface fills: card → hover → selected ───────────────────────────── */
  --db-fill-1: color-mix(in srgb, var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, .045)) 40%, transparent);
  --db-fill-2: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, .045));
  --db-fill-3: color-mix(in srgb, var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, .045)) 140%, transparent);
  --db-fill-4: var(--dsw-alias-interactive-bg-active, rgba(255, 255, 255, .085));
  --db-fill-5: color-mix(in srgb, var(--dsw-alias-interactive-bg-active, rgba(255, 255, 255, .085)) 130%, transparent);
  --db-fill-6: color-mix(in srgb, var(--dsw-alias-interactive-bg-active, rgba(255, 255, 255, .085)) 160%, transparent);

  /* ── text: official primary / secondary / tertiary / caption + a dimmer ── */
  --db-text: var(--dsw-alias-label-primary, #f4f4f5);
  --db-text-2: var(--dsw-alias-label-secondary, #d6d6db);
  --db-text-3: var(--dsw-alias-label-tertiary, #a6a6ad);
  --db-text-4: var(--dsw-alias-label-caption, #6f6f78);
  --db-text-5: color-mix(in srgb, var(--dsw-alias-label-caption, #6f6f78) 78%, transparent);

  /* ── strokes: official border tiers ────────────────────────────────────── */
  /* The island outline is unchained: it is a hairline ON the window ground,
     a role the official border tiers (all drawn inside one panel) have no
     entry for. */
  --db-line-panel: rgba(255, 255, 255, .05);
  --db-line: var(--dsw-alias-border-l1, rgba(255, 255, 255, .06));
  --db-line-card: var(--dsw-alias-border-l1, rgba(255, 255, 255, .08));
  --db-line-container: var(--dsw-alias-border-l2, rgba(255, 255, 255, .08));
  --db-line-input: var(--dsw-alias-border-l2, rgba(255, 255, 255, .09));
  --db-line-input-2: var(--dsw-alias-border-l3, rgba(255, 255, 255, .14));
  --db-line-emphasis: var(--dsw-alias-border-l3, rgba(255, 255, 255, .14));
  --db-line-focus: var(--dsw-alias-border-l4, rgba(255, 255, 255, .22));
  --db-line-hover: var(--dsw-alias-interactive-bg-active, rgba(255, 255, 255, .28));
  --db-line-dashed: var(--dsw-alias-border-l2, rgba(255, 255, 255, .14));

  /* ── semantics: the only colours on screen ─────────────────────────────── */
  /* Brand red is unchained and is NOT a state: it marks identity once, beside
     the sidebar wordmark, and is never borrowed for selection or warning
     (DESIGN_INTENT §10). The official palette's red is an error colour. */
  --db-brand: #ec3013;
  --db-brand-wash: color-mix(in srgb, #ec3013 14%, transparent);
  --db-run: var(--dsw-alias-state-success-primary, #3ecf8e);
  --db-run-soft: color-mix(in srgb, var(--dsw-alias-state-success-primary, #3ecf8e) 80%, var(--dsw-alias-label-primary, #f4f4f5));
  --db-run-wash: color-mix(in srgb, var(--dsw-alias-state-success-primary, #3ecf8e) 14%, transparent);
  --db-await: var(--dsw-alias-state-warning-primary, #e9a23b);
  --db-await-wash: color-mix(in srgb, var(--dsw-alias-state-warning-primary, #e9a23b) 13%, transparent);
  --db-primary: var(--dsw-alias-state-business-primary, #679efe);
  --db-offline: #55555e;

  /* ── type ──────────────────────────────────────────────────────────────── */
  /* Body is Archivo, code is the system mono stack, and the pixel face is
     demoted to the brand wordmark alone — all three set in ui/fonts.ts. */
  --db-font: var(--dsw-font-family);
  --db-mono: var(--ds-font-family-code);
  --db-brandfont: "Departure Mono", ui-monospace, Menlo, monospace;

  /* ── radii (unchained): panel 20 / dialog 24 / popover 14 / input 16 /
        card 12 / row 10 / control 9 / chip 8 ────────────────────────────── */
  --db-r-panel: 20px;
  --db-r-dialog: 24px;
  --db-r-popover: 14px;
  --db-r-badge: 8px;
  --db-r-chip: 8px;
  --db-r-swatch: 10px;
  --db-r-control: 9px;
  --db-r-row: 10px;
  --db-r-input: 16px;
  --db-r-card: 12px;
  --db-r-surface: 12px;
  --db-r-editor: 12px;

  /* ── motion: official transition durations / ease ──────────────────────── */
  --db-in: var(--ds-transition-duration-fast, 0.1s) var(--ds-ease-in-out, cubic-bezier(.4, 0, .2, 1));
  --db-size: var(--ds-transition-duration-normal, 0.2s) var(--ds-ease-in-out, cubic-bezier(.4, 0, .2, 1));
  --db-tint: var(--ds-transition-duration-fast, 0.1s) var(--ds-ease-in-out, cubic-bezier(.4, 0, .2, 1));

  /* ── elevation ─────────────────────────────────────────────────────────── */
  --db-shadow-popover: 0 16px 40px rgba(0, 0, 0, .5);
  --db-shadow-menu: 0 16px 40px rgba(0, 0, 0, .5);
  --db-shadow-dialog: 0 32px 80px rgba(0, 0, 0, .6);

  /* color-scheme is NOT pinned here: the theme presenter sets it on the root
     per snapshot, and inheritance carries it — a dark pin would keep dark
     scrollbars and native widgets inside .dbdy under the light theme. */
}

/* ── the light scheme's island stack ───────────────────────────────────── */
/* Chained tokens follow the official light palette on their own; the
   unchained island roles are literals, so their light values are stated
   here. The presenter's body attribute is the switch (dsh/theme-presenter.ts
   removes it for light). Same material logic, inverted: the window ground is
   the DARKEST layer in dark and the DEEPEST (most saturated gray) in light,
   panels float brighter on it, and the embedded void reads as paper. */
body:not([data-ds-dark-theme]) .dbdy {
  --db-window: #dcdde1;
  --db-panel: #f4f4f6;
  --db-raised: #ffffff;
  --db-void: #ffffff;
  --db-popover: #ffffff;
  --db-dialog: #ffffff;
  --db-line-panel: rgba(0, 0, 0, .08);
  --db-offline: #a3a3ab;
  --db-shadow-popover: 0 16px 40px rgba(0, 0, 0, .16);
  --db-shadow-menu: 0 16px 40px rgba(0, 0, 0, .16);
  --db-shadow-dialog: 0 32px 80px rgba(0, 0, 0, .22);
}

.dbdy, .dbdy * { box-sizing: border-box; }
/* Font only — never color: official surfaces (the settings dialog, the
   conversation column) render inside .dbdy too, and \`color: inherit\` here
   overrode their buttons' own foreground (a white-on-white 保存 button).
   Every KIT control declares its color explicitly. */
.dbdy button { font-family: var(--db-font); }
.dbdy input, .dbdy textarea { font-family: var(--db-font); }
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

/* ── the column seam ───────────────────────────────────────────────────── */
/* The drag handle fills the 10px gap exactly, so the grab target IS the seam
   and the window ground shows through it. The rule inside it is invisible at
   rest — the gap already separates the islands — and lights up in the action
   colour only while it is being pointed at or dragged. Hover and the drag
   class are the two things an inline style cannot express, so the whole
   handle is drawn here (shell/ColumnFrame.tsx renders the element). */
.dbdy-handle {
  position: relative;
  flex: 0 0 var(--db-gap);
  width: var(--db-gap);
  z-index: 10;
  cursor: col-resize;
  touch-action: none;
  background: transparent;
  /* The ground around it drags the window; a press on the handle itself must
     stay a column resize. */
  -webkit-app-region: no-drag;
}
.dbdy-handle::after {
  content: "";
  position: absolute;
  inset: 22px auto 22px 50%;
  width: 2px;
  border-radius: 2px;
  transform: translateX(-1px);
  background: transparent;
  pointer-events: none;
  transition: background var(--db-tint);
}
.dbdy-handle:hover::after,
.dbdy-handle.dragging::after { background: var(--db-primary); }

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

/* Sidebar collapsed (both shells): the lights (native reservation under
   Electron, simulated dots in a browser) + expand toggle float at the main
   column's top-left on the 52px header line (ThreeColumnFrame), so the
   header title steps right of the lockup: 12 left + 54 lights reservation
   (the browser's three 11px dots at gap 7 are narrower) + 12 gap + 28
   toggle = 106, plus a little air. */
.dbdy-noside header[class*="_header"] > div[class*="_titleRow"] { padding-left: 112px; }

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
/* Overlay entries float over the draggable ground: interactive again, and
   never window-drag surfaces. */
.dbdy-overlay > * { pointer-events: auto; -webkit-app-region: no-drag; }
`

/**
 * The official build-hash class suffixes the CSS above restyles via
 * `[class*="…"]`. The DOM presence of each is state-dependent (the hero only
 * exists on a blank conversation, the session header only with one open), so
 * the sentinel checks the official STYLESHEETS instead: those are static at
 * startup, and a suffix absent from every rule means the official build
 * renamed it and the matching restyle above is silently dead.
 */
export const OFFICIAL_CLASS_SUFFIXES = [
  '_headline', '_headlineText', '_previewBadge',
  '_sessionLogButton', '_header', '_titleRow', '_tabs',
] as const

/** Warn once per suffix that no longer appears in any official stylesheet. */
function auditOfficialClasses(): void {
  let text = ''
  for (const sheet of Array.from(document.styleSheets)) {
    // Skip our own sheet — its selectors quote the suffixes and would make
    // the audit always pass. Cross-origin sheets refuse cssRules; skip those.
    const owner = sheet.ownerNode
    if (owner instanceof HTMLElement && owner.dataset['owner'] === 'dsh-plugin-deepbuddy') continue
    let rules: CSSRuleList
    try { rules = sheet.cssRules } catch { continue }
    for (const rule of Array.from(rules)) text += rule.cssText
  }
  for (const suffix of OFFICIAL_CLASS_SUFFIXES) {
    if (!text.includes(suffix)) {
      dbwarn('tokens', `official class suffix "${suffix}" is gone from the stylesheets — its restyle rules are dead; the official build likely renamed it (locked against 0.1.1-rc.2)`)
    }
  }
}

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
  // The official CSS is on the page well before this plugin loads; 5s leaves
  // slack for any late-linked sheet without ever warning during startup.
  const audit = setTimeout(auditOfficialClasses, 5000)
  return () => { clearTimeout(audit); el.remove() }
}
