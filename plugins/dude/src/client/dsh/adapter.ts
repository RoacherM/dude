/**
 * The only layer that touches the official app: it installs the stylesheet
 * whose selectors address the official `data-*` attributes.
 */
import type { Context } from '@deepseek-ai/cordis'
import { installStyles } from '../ui/styles.ts'

/**
 * Mount the stylesheet on an effect so a reload withdraws it.
 * @param ctx - the client root context.
 */
export function mountOfficialServices(ctx: Context): void {
  ctx.effect(() => installStyles(), 'dude: styles')
}
