/**
 * The plugin entry. The official ui-layout row owns the window, and the
 * official sidebars own both columns. Dude adds only its stylesheet
 * (window drag surfaces and traffic-light clearance) and its brand in the hero.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { mountOfficialServices } from '../dsh/adapter.ts'

/** Entry name; matches the package name the boot graph addresses. */
export const name = 'dsh-plugin-dude'

export const inject = ['slots']

export function apply(ctx: Context): void {
  mountOfficialServices(ctx)
}
