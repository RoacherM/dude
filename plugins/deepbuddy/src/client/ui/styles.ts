/**
 * The rules DeepBuddy adds to the official app: window drag surfaces for the
 * hidden-inset title bar, and the hero mark's hover motion.
 *
 * `-webkit-app-region: drag` makes an element move the window, and it
 * swallows clicks on everything inside it unless that part opts out with
 * `no-drag`. Browsers ignore both; only Electron reads them.
 */

const CSS = `
/* Every interactive element opts out of dragging. Unscoped on purpose:
   Electron collects app-region rects viewport-globally, so a menu or dialog
   portaled over a drag surface would otherwise move the window instead of
   answering clicks. */
button, a, input, textarea, select,
[role="tab"], [role="button"], [role="menuitem"], [role="treeitem"],
[contenteditable], [role="dialog"], [role="menu"], [role="listbox"], [role="option"] {
  -webkit-app-region: no-drag;
}

/* ── hero fish hover motion ────────────────────────────────────────────── */
/* The hero mark sways on hover. Reduced motion keeps it still. */
.hero-fish {
  transform-origin: 50% 60%;
  display: block;
  overflow: visible;
}
@keyframes dbdy-hero-fish-swim {
  0%, 100% { transform: none; }
  35% { transform: rotate(-4deg) translate(-.4px, -.9px); }
  70% { transform: rotate(1.6deg) translate(.3px, .2px); }
}
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .hero-fish:hover {
    animation: 1.6s ease-in-out infinite dbdy-hero-fish-swim;
  }
}

/* Window drag surfaces. Each one is an official element whose clickable
   parts are its descendants and opt out above; a drag element laid over
   buttons it does not contain would swallow their clicks. The official frame
   is found through its data-rightbar-col child, not its hashed class. */

/* Official sidebar column. 36px clears the macOS traffic lights. */
:has(> [data-rightbar-col]) > div:first-of-type {
  -webkit-app-region: drag;
  padding-top: 36px;
  box-sizing: border-box;
}

/* Home screen: no conversation header is shown, so the empty hero page moves
   the window. The composer does not. */
[data-phase="hero"] { -webkit-app-region: drag; }
[data-phase="hero"] [data-composer-seat] { -webkit-app-region: no-drag; }

/* Right sidebar tab strip: its empty stretch moves the window; the tabs and
   icons in it are buttons and opt out. */
[data-rightbar-col] [data-dockkit-strip] { -webkit-app-region: drag; }

/* Right sidebar fullscreen is a fixed panel over the whole window, so its
   first strip shares the top row with the traffic lights. Every strip rises
   to the lights' height (their centre sits 18px down), and the top-left
   pane's strip starts right of them. The top-left pane is the one with no
   later split cell above it. */
[data-rightbar-fullscreen] [data-dockkit-strip] { padding-top: 4px; }
[data-rightbar-fullscreen] [data-dockkit-pane]:not([data-dockkit-cell]:not(:first-child) *) [data-dockkit-strip] {
  padding-left: 80px;
}

/* Conversation title bar. The title and the icons are buttons inside this
   header, so they stay clickable. The empty stretch of the bar moves the
   window. A drag overlay on top of the header cannot do this: those buttons
   would not be descendants, and the click would drag instead. */
header:has([data-conversation-header-corner]) {
  -webkit-app-region: drag;
}
`

/**
 * Install the stylesheet.
 * @param extra - CSS appended after these rules (the font faces, ui/fonts.ts).
 * @returns disposer removing the style element.
 */
export function installStyles(extra = ''): () => void {
  const el = document.createElement('style')
  el.dataset['owner'] = 'dsh-plugin-deepbuddy'
  el.textContent = CSS + extra
  document.head.append(el)
  return () => { el.remove() }
}
