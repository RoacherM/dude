/**
 * The rules Dude adds to the official app: window drag surfaces for the
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

/* Official sidebar column. 36px clears the macOS traffic lights. It is also
   the anchor the fullscreen right sidebar starts from. */
:has(> [data-rightbar-col]) > div:first-of-type {
  -webkit-app-region: drag;
  padding-top: 36px;
  box-sizing: border-box;
  anchor-name: --db-sidebar;
}

/* Home screen: no conversation header is shown, so the empty hero page moves
   the window. The composer does not. */
[data-phase="hero"] { -webkit-app-region: drag; }
[data-phase="hero"] [data-composer-seat] { -webkit-app-region: no-drag; }

/* Right sidebar tab strip: its empty stretch moves the window; the tabs and
   icons in it are buttons and opt out. */
[data-rightbar-col] [data-dockkit-strip] { -webkit-app-region: drag; }

/* Right sidebar fullscreen. With the sidebar open, the panel covers the
   conversation but not the sidebar: the official panel is fixed over the
   whole window, and its left edge moves to the sidebar's right edge,
   following it as it is resized. The panel's inline width stays 100%, so
   max-width trims it to the room left. The official rule sets inset from a
   class plus this attribute, so the selector needs more parts to win in
   either stylesheet order.
   With the sidebar collapsed, the panel keeps the official whole-window
   cover: the traffic lights (about 66px wide) do not fit the 56px rail, so
   they sit on the panel's tab strip instead, and the top-left pane's strip
   starts right of them. The top-left pane is the one with no later split
   cell above it. Both rules key on the panel's own attribute, which is set
   before it slides in, so nothing jumps when the slide ends.
   The strips keep their official height, which shares the traffic lights'
   row, so the icons do not move when the panel changes mode. */
:not([data-sidebar-collapsed]) > [data-rightbar-col] [data-sidebar-right-panel][data-sidebar-right-panel="fullscreen"] {
  left: anchor(--db-sidebar right);
  max-width: calc(100vw - anchor-size(--db-sidebar width));
}
[data-sidebar-collapsed] [data-sidebar-right-panel="fullscreen"] [data-dockkit-pane]:not([data-dockkit-cell]:not(:first-child) *) [data-dockkit-strip] {
  padding-left: 80px;
}
/* Electron collects drag regions regardless of what is painted on top, so
   the collapsed rail stops dragging while the open panel covers it. */
[data-sidebar-collapsed]:has([data-sidebar-right-panel="fullscreen"][data-sidebar-right-open]) > div:first-of-type {
  -webkit-app-region: no-drag;
}

/* Conversation title bar. The title and the icons are buttons inside this
   header, so they stay clickable. The empty stretch of the bar moves the
   window. A drag overlay on top of the header cannot do this: those buttons
   would not be descendants, and the click would drag instead. */
header:has([data-conversation-header-corner]) {
  -webkit-app-region: drag;
}
/* Electron collects drag regions regardless of what is painted on top, so
   the header must stop dragging while the fullscreen panel covers it. */
[data-rightbar-fullscreen] header:has([data-conversation-header-corner]) {
  -webkit-app-region: no-drag;
}
`

/**
 * Install the stylesheet.
 * @param extra - CSS appended after these rules (the font faces, ui/fonts.ts).
 * @returns disposer removing the style element.
 */
export function installStyles(extra = ''): () => void {
  const el = document.createElement('style')
  el.dataset['owner'] = 'dsh-plugin-dude'
  el.textContent = CSS + extra
  document.head.append(el)
  return () => { el.remove() }
}
