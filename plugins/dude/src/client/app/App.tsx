/**
 * The plugin entry. The official ui-layout row owns the window, and the
 * official sidebars own both columns. The desktop shell uses the system title
 * bar, so there is nothing for the page to add; the row stays so the boot
 * manifest is recognisably Dude's (sync-upstream's smoke checks for it).
 */
import type { Context } from '@deepseek-ai/cordis'

/** Entry name; matches the package name the boot graph addresses. */
export const name = 'dsh-plugin-dude'

export function apply(_ctx: Context): void {}
