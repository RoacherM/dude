/**
 * Global theme DOM applier, re-implemented for DeepBuddy.
 *
 * Projecting `ctx.theme` snapshots onto the document is the layout plugin's
 * job in the official assembly (`packages/client/ui-layout/src/client/
 * theme-presenter.ts`). DeepBuddy takes over the frame contract, so it takes
 * over this too: with the `ui-layout` row disabled nothing else writes
 * `color-scheme`, the dark palette attribute, or a theme's alias-token
 * overrides, and every `--dsw-*` consumer in the tree — the official workspace
 * drawer in `shell.overlay`, every ecosystem plugin in an open seat — would
 * read the light base palette forever.
 *
 * Re-implemented rather than imported: cross-plugin VALUE imports are a build
 * error (client bundle purity, build.mjs), so the official file is a read-only
 * reference. Behaviour is identical, including the retraction discipline —
 * the presenter only ever removes what it wrote itself, so foreign
 * attributes, inline styles, and metadata survive.
 *
 * The scheme follows the snapshot, light included: every DeepBuddy `--db-*`
 * token resolves through the official `--dsw-alias-*` variables (ui/tokens.ts
 * — the dark literals there are fallbacks, not values), so removing the dark
 * palette attribute restyles DeepBuddy's own surfaces and the ecosystem seats
 * from the same switch. The settings dialog offers 浅色/深色/跟随系统 — a
 * presenter that pinned dark would turn that control into a no-op.
 */
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'

/** Body attribute selecting the dark base palette in the token stylesheets. */
export const DARK_ATTRIBUTE = 'data-ds-dark-theme'

/** Applies theme snapshots to the document; one instance per plugin fiber. */
export class ThemePresenter {
  /** Token names written by the last apply — this presenter's retraction set. */
  private appliedTokens: string[] = []

  /** The single metadata node this presenter inserts and removes. */
  private readonly themeColorMeta: HTMLMetaElement

  /** Create the presenter-owned metadata node before the first snapshot arrives. */
  constructor() {
    this.themeColorMeta = document.createElement('meta')
    this.themeColorMeta.name = 'theme-color'
  }

  /**
   * Project a snapshot onto the document: set root `color-scheme` and the
   * body palette attribute from `active.colorScheme` (never the id —
   * `system` is resolved upstream), then swap the previously applied token
   * variables for `active.tokens`. Browser theme-color metadata follows the
   * computed body background after those writes, so the rendered palette
   * stays the color authority.
   * @param snapshot - resolved theme snapshot from ctx.theme.
   */
  apply(snapshot: ThemeSnapshot): void {
    const scheme = snapshot.active.colorScheme
    document.documentElement.style.colorScheme = scheme
    const body = document.body
    if (scheme === 'dark') body.setAttribute(DARK_ATTRIBUTE, '')
    else body.removeAttribute(DARK_ATTRIBUTE)
    for (const name of this.appliedTokens) body.style.removeProperty(name)
    this.appliedTokens = []
    for (const [name, value] of Object.entries(snapshot.active.tokens)) {
      body.style.setProperty(name, value)
      this.appliedTokens.push(name)
    }
    this.themeColorMeta.content = getComputedStyle(body).backgroundColor
    if (!this.themeColorMeta.isConnected) document.head.append(this.themeColorMeta)
  }

  /** Retract root color-scheme, the palette attribute, token variables, and the owned metadata node. */
  dispose(): void {
    document.documentElement.style.removeProperty('color-scheme')
    const body = document.body
    body.removeAttribute(DARK_ATTRIBUTE)
    for (const name of this.appliedTokens) body.style.removeProperty(name)
    this.appliedTokens = []
    this.themeColorMeta.remove()
  }
}
