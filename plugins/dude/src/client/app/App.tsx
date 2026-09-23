/**
 * The plugin entry. The official ui-layout row owns the window, and the
 * official sidebars own both columns. Dude adds only its stylesheet: window
 * drag surfaces and traffic-light clearance.
 */
import type { Context } from '@deepseek-ai/cordis'
import { mountOfficialServices } from '../dsh/adapter.ts'

/** Entry name; matches the package name the boot graph addresses. */
export const name = 'dsh-plugin-dude'

export function apply(ctx: Context): void {
  mountOfficialServices(ctx)
}
