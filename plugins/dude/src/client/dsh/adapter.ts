/**
 * The only layer that understands the DSH ABI: the slot registry the hero
 * brand mark is registered into.
 */
import { createElement } from 'react'
import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { installStyles } from '../ui/styles.ts'

/**
 * The Dude fish: a chubby blue fish in the app icon's colours, drawn whole
 * so it still reads at the hero's 34px. Coloured rather than currentColor,
 * so it is the same fish on the light and dark themes.
 */
const FISH_TAIL = 'M24 12.5 L31 6.8 Q32.8 6 32.4 8.2 L31 12.5 L32.4 16.8 Q32.8 19 31 18.2 Z'
const FISH_SHAPES: ReadonlyArray<{ cx: number; cy: number; rx: number; ry: number; fill: string }> = [
  { cx: 12.5, cy: 3.4, rx: 2.8, ry: 2.2, fill: '#B5D4F4' }, // dorsal fin
  { cx: 13, cy: 13, rx: 12, ry: 10.4, fill: '#7FB3E6' }, // body
  { cx: 13, cy: 19.3, rx: 7.6, ry: 3.6, fill: '#F7F1EC' }, // belly
  { cx: 8, cy: 12.6, rx: 1.25, ry: 1.75, fill: '#3F6FB5' }, // eyes
  { cx: 18, cy: 12.6, rx: 1.25, ry: 1.75, fill: '#3F6FB5' },
  { cx: 5.8, cy: 15.6, rx: 1.8, ry: 1, fill: '#F2C4C0' }, // blush
  { cx: 20.2, cy: 15.6, rx: 1.8, ry: 1, fill: '#F2C4C0' },
]

/**
 * The Dude mark rendered into the official conversation hero's
 * `conversation.hero.brand.mark` seat at priority -1, at the official
 * mark's 34px width, next to the official headline and preview badge.
 */
function DudeBrandMark(): ReactNode {
  return createElement('svg', {
    'viewBox': '0 0 34 25',
    'width': 34,
    'height': 25,
    'fill': 'none',
    'aria-label': 'Dude',
    'className': 'hero-fish',
  },
  createElement('path', {
    d: FISH_TAIL,
    fill: '#7FB3E6',
    stroke: '#7FB3E6',
    strokeWidth: 1.4,
    strokeLinejoin: 'round',
  }),
  ...FISH_SHAPES.map((shape, i) => createElement('ellipse', { key: i, ...shape })))
}

/**
 * Mount the stylesheet and the hero brand mark, each on its own effect so a
 * reload withdraws both.
 * @param ctx - the client root context.
 */
export function mountOfficialServices(ctx: Context): void {
  ctx.effect(() => installStyles(), 'dude: styles')

  // The ui-brand-official row registers a `FishLogo` into
  // `conversation.hero.brand.mark` at priority 0; Dude registers at -1
  // and the single slot renders the lowest priority. The hero's headline and
  // preview badge stay the official copy.
  const slots = ctx.slots as unknown as {
    inject(key: string, cb: () => (() => void) | void): () => void
    register(options: { name: string; priority?: number }, comp: () => ReactNode): () => void
  }
  ctx.effect(() => slots.inject('conversation.hero.brand.mark', () => slots.register({
    name: 'conversation.hero.brand.mark',
    priority: -1,
  }, DudeBrandMark)), 'dude: brand mark')
}
