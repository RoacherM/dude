/**
 * The plugin entry. The official ui-layout row owns the window, and the
 * official sidebars own both columns. DeepBuddy adds only its stylesheet
 * (typeface and window drag surfaces) and its brand in the hero.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { mountOfficialServices } from '../dsh/adapter.ts'

/** Entry name; matches the package name the boot graph addresses. */
export const name = 'dsh-plugin-deepbuddy'

export const inject = ['slots']

export function apply(ctx: Context): void {
  mountOfficialServices(ctx)
}
