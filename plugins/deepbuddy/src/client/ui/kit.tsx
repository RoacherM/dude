/**
 * The component kit every DeepBuddy surface draws with. One implementation of
 * each control in `COMPONENTS.md`, built on the tokens in ui/tokens.ts.
 *
 * Every size, colour and state here is transcribed from the handoff rather
 * than chosen: `COMPONENTS.md` is a specification with numbers in it, and a
 * single implementation is what stops one panel rounding 34px to 36px on its
 * way past.
 *
 * Two conventions the kit enforces structurally:
 *
 * - **No borders on rows.** Cards and popovers carry a hairline; list rows and
 *   settings rows separate with fill and space. The kit simply offers no
 *   bordered row.
 * - **No weight ramp.** Nothing here sets `fontWeight` above 500 except the
 *   wordmark and the hero line. Hierarchy comes from the five text steps.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ChevronDown, Search } from './icons.tsx'

/** Shared props every kit component accepts. */
interface Common {
  style?: CSSProperties
  title?: string
}

/** Kit component faces — the shapes COMPONENTS.md specifies, nothing more. */
export interface Kit {
  /**
   * `primary` is capped at one per screen by convention and by review, not by
   * the type; `secondary` is the outline pill; `text` is the borderless one.
   */
  Button: (p: Common & {
    kind?: 'primary' | 'secondary' | 'text'
    size?: 30 | 34 | 36
    disabled?: boolean
    onClick?: () => void
    children: ReactNode
  }) => ReactNode
  IconButton: (p: Common & {
    size?: 26 | 28 | 30 | 34
    active?: boolean
    disabled?: boolean
    onClick?: () => void
    /** Required: an icon with no name is unusable by anyone not looking at it. */
    title: string
    children: ReactNode
  }) => ReactNode
  Input: (p: Common & {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    /** Identifiers (paths, ids, keys, model names) render in JetBrains Mono. */
    mono?: boolean
    size?: 30 | 38 | 44
    type?: 'text' | 'password'
    autoFocus?: boolean
    onKeyDown?: (e: React.KeyboardEvent) => void
  }) => ReactNode
  Select: <T extends string>(p: Common & {
    value: T
    options: readonly { id: T; label: string; detail?: string }[]
    onChange: (v: T) => void
    /** Pill form sizes to content; form form is a fixed 340px field. */
    form?: 'pill' | 'field'
    disabled?: boolean
    /** Above this many options the menu grows a search row. */
    placeholder?: string
  }) => ReactNode
  Switch: (p: Common & { on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) => ReactNode
  Badge: (p: Common & { tone?: 'neutral' | 'run' | 'await' | 'outline'; children: ReactNode }) => ReactNode
  StatusPill: (p: Common & { tone: 'run' | 'await' | 'offline' | 'neutral'; children: ReactNode }) => ReactNode
  Card: (p: Common & { onClick?: () => void; children: ReactNode }) => ReactNode
  /** Anchored floating surface; closes on outside click, Esc, or another opening. */
  Popover: (p: Common & { open: boolean; onClose: () => void; anchor: ReactNode; align?: 'left' | 'right'; direction?: 'down' | 'up'; children: ReactNode }) => ReactNode
  /** Dashed empty state: one sentence about the consequence, no art, no button. */
  EmptyState: (p: Common & { children: ReactNode }) => ReactNode
  /** `underline` for content sections, `segment` for surface switching. Never both at one level. */
  Tabs: <T extends string>(p: Common & { form: 'underline' | 'segment'; value: T; tabs: readonly { id: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void }) => ReactNode
  /**
   * A list row — the shape every rail in the window is made of: sidebar nav,
   * session rows, settings rail, dock tree entries.
   *
   * It exists because the alternative was each panel picking its own height,
   * and three panels disagreeing by 6px is exactly the drift a shipped kit is
   * supposed to make impossible. Height, radius, padding and the selected
   * fill are not props.
   */
  Row: (p: Common & {
    /** Selected state: the fill, not a border and not a colour. */
    current?: boolean
    icon?: ReactNode
    /** Right-hand metadata (timestamp, badge, count) — muted by default. */
    trailing?: ReactNode
    /** One nesting step, for tree children and grouped rows. */
    indent?: boolean
    /** Compact rows for dense trees; the default is the rail row. */
    dense?: boolean
    onClick?: () => void
    children: ReactNode
  }) => ReactNode
  /** Group label above a run of rows: the quietest text step, no uppercase. */
  GroupLabel: (p: Common & { onClick?: () => void; trailing?: ReactNode; children: ReactNode }) => ReactNode
  /** Settings row: title + description left, control right, hairline below. */
  SettingRow: (p: Common & { label: string; description?: string; children: ReactNode }) => ReactNode
  /** Status dot. */
  Dot: (p: Common & { tone?: 'run' | 'await' | 'offline' | 'primary' | 'muted'; size?: number }) => ReactNode
  /** Monospace inline text — identifiers, paths, shortcuts. */
  Mono: (p: Common & { children: ReactNode }) => ReactNode
}

/** Pill radius: every capsule takes half its height. */
const half = (h: number): number => h / 2

const ROW: CSSProperties = { display: 'flex', alignItems: 'center' }

// ── buttons ─────────────────────────────────────────────────────────────────

const Button: Kit['Button'] = ({ kind = 'secondary', size = 34, disabled, onClick, title, style, children }) => {
  if (kind === 'text') {
    return (
      <button
        type="button"
        {...title === undefined ? {} : { title }}
        {...onClick === undefined ? {} : { onClick }}
        disabled={disabled === true}
        className="dbdy-hv-text"
        style={{
          border: 0, background: 'transparent', padding: 0, cursor: disabled === true ? 'default' : 'pointer',
          fontSize: 12.5, color: 'var(--db-text-2)', transition: 'color var(--db-tint)',
          opacity: disabled === true ? 0.45 : 1, whiteSpace: 'nowrap', ...style,
        }}
      >
        {children}
      </button>
    )
  }
  const primary = kind === 'primary'
  return (
    <button
      type="button"
      {...title === undefined ? {} : { title }}
      {...onClick === undefined ? {} : { onClick }}
      disabled={disabled === true}
      className={primary ? 'dbdy-hv-primary' : 'dbdy-hv-outline'}
      style={{
        ...ROW,
        justifyContent: 'center',
        gap: 7,
        height: size,
        padding: primary ? '0 19px' : '0 16px',
        borderRadius: half(size),
        border: primary ? 0 : '1px solid var(--db-line-emphasis)',
        background: primary ? '#ededed' : 'transparent',
        color: primary ? '#141414' : 'var(--db-text)',
        fontSize: 13,
        fontWeight: primary ? 520 : 400,
        cursor: disabled === true ? 'default' : 'pointer',
        opacity: disabled === true ? 0.45 : 1,
        whiteSpace: 'nowrap',
        transition: 'background var(--db-tint), border-color var(--db-tint)',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

const IconButton: Kit['IconButton'] = ({ size = 28, active, disabled, onClick, title, style, children }) => (
  <button
    type="button"
    title={title}
    {...onClick === undefined ? {} : { onClick }}
    disabled={disabled === true}
    className="dbdy-hv-icon"
    style={{
      ...ROW,
      justifyContent: 'center',
      width: size,
      height: size,
      flex: `0 0 ${size}px`,
      borderRadius: half(size),
      border: 0,
      background: active === true ? 'var(--db-fill-5)' : 'transparent',
      color: active === true ? 'var(--db-text)' : 'var(--db-text-3)',
      padding: 0,
      cursor: disabled === true ? 'default' : 'pointer',
      opacity: disabled === true ? 0.4 : 1,
      transition: 'background var(--db-tint), color var(--db-tint)',
      ...style,
    }}
  >
    {children}
  </button>
)

// ── inputs ──────────────────────────────────────────────────────────────────

const Input: Kit['Input'] = ({ value, onChange, placeholder, mono, size = 38, type = 'text', autoFocus, onKeyDown, title, style }) => {
  const [focused, setFocused] = useState(false)
  return (
    <input
      value={value}
      type={type}
      {...title === undefined ? {} : { title }}
      {...placeholder === undefined ? {} : { placeholder }}
      {...autoFocus === true ? { autoFocus: true } : {}}
      {...onKeyDown === undefined ? {} : { onKeyDown }}
      onChange={(e) => { onChange(e.target.value) }}
      onFocus={() => { setFocused(true) }}
      onBlur={() => { setFocused(false) }}
      style={{
        width: '100%',
        height: size,
        // The handoff gives settings fields 14px and panel fields 11–12px:
        // the radius follows the control's own height, not a global step.
        borderRadius: size >= 44 ? 'var(--db-r-input)' : 12,
        border: `1px solid ${focused ? 'var(--db-line-focus)' : 'var(--db-line-input)'}`,
        background: 'var(--db-fill-3)',
        padding: `0 ${size >= 44 ? 14 : 11}px`,
        outline: 'none',
        color: 'var(--db-text)',
        fontFamily: mono === true ? 'var(--db-mono)' : 'var(--db-font)',
        fontSize: mono === true ? 13 : 13.5,
        transition: 'border-color var(--db-tint)',
        ...style,
      }}
    />
  )
}

const Switch: Kit['Switch'] = ({ on, onChange, disabled, title, style }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    {...title === undefined ? {} : { title }}
    disabled={disabled === true}
    onClick={() => { onChange(!on) }}
    style={{
      width: 40,
      height: 22,
      flex: '0 0 40px',
      borderRadius: 11,
      border: 0,
      padding: 2,
      background: on ? 'var(--db-primary)' : 'rgba(255,255,255,.12)',
      cursor: disabled === true ? 'default' : 'pointer',
      opacity: disabled === true ? 0.45 : 1,
      transition: 'background var(--db-tint)',
      display: 'flex',
      justifyContent: on ? 'flex-end' : 'flex-start',
      ...style,
    }}
  >
    <span style={{
      width: 18, height: 18, borderRadius: '50%', background: '#fff', display: 'block',
      transition: 'transform var(--db-tint)',
    }}
    />
  </button>
)

// ── marks ───────────────────────────────────────────────────────────────────

const TONE: Record<string, string> = {
  run: 'var(--db-run)',
  await: 'var(--db-await)',
  offline: 'var(--db-offline)',
  primary: 'var(--db-primary)',
  muted: 'var(--db-text-3)',
  neutral: 'var(--db-text-3)',
}

const Dot: Kit['Dot'] = ({ tone = 'muted', size = 7, title, style }) => (
  <span
    {...title === undefined ? {} : { title }}
    style={{
      width: size, height: size, flex: `0 0 ${size}px`, borderRadius: '50%',
      background: TONE[tone] ?? 'var(--db-text-3)', display: 'block', ...style,
    }}
  />
)

const Mono: Kit['Mono'] = ({ children, title, style }) => (
  <span
    {...title === undefined ? {} : { title }}
    style={{ fontFamily: 'var(--db-mono)', fontSize: 11.5, color: 'var(--db-text-3)', ...style }}
  >
    {children}
  </span>
)

const Badge: Kit['Badge'] = ({ tone = 'neutral', children, title, style }) => {
  const skin: CSSProperties = tone === 'run'
    ? { background: 'var(--db-run-wash)', color: 'var(--db-run-soft)', border: 0 }
    : tone === 'await'
      ? { background: 'var(--db-await-wash)', color: 'var(--db-await)', border: 0 }
      : tone === 'outline'
        ? { background: 'transparent', color: 'var(--db-text-2)', border: '1px solid rgba(255,255,255,.12)' }
        : { background: 'var(--db-fill-5)', color: 'var(--db-text-3)', border: 0 }
  return (
    <span
      {...title === undefined ? {} : { title }}
      style={{
        ...ROW, flex: '0 0 auto', gap: 5, padding: '2px 6px', borderRadius: 'var(--db-r-badge)',
        fontSize: 10.5, fontFamily: 'var(--db-mono)', whiteSpace: 'nowrap', ...skin, ...style,
      }}
    >
      {children}
    </span>
  )
}

const StatusPill: Kit['StatusPill'] = ({ tone, children, title, style }) => (
  <span
    {...title === undefined ? {} : { title }}
    style={{
      ...ROW, flex: '0 0 auto', gap: 6, height: 28, padding: '0 11px', borderRadius: 14,
      background: 'var(--db-fill-4)', fontSize: 12, whiteSpace: 'nowrap',
      color: tone === 'neutral' ? 'var(--db-text-2)' : TONE[tone], ...style,
    }}
  >
    <Dot tone={tone === 'neutral' ? 'muted' : tone} size={6} />
    {children}
  </span>
)

// ── containers ──────────────────────────────────────────────────────────────

const Card: Kit['Card'] = ({ onClick, children, title, style }) => (
  <div
    {...title === undefined ? {} : { title }}
    {...onClick === undefined ? {} : { onClick }}
    className={onClick === undefined ? undefined : 'dbdy-hv-1'}
    style={{
      borderRadius: 'var(--db-r-surface)',
      background: 'var(--db-fill-1)',
      border: '1px solid var(--db-line-card)',
      cursor: onClick === undefined ? 'default' : 'pointer',
      transition: 'background var(--db-tint)',
      ...style,
    }}
  >
    {children}
  </div>
)

const EmptyState: Kit['EmptyState'] = ({ children, title, style }) => (
  <div
    {...title === undefined ? {} : { title }}
    style={{
      border: '1px dashed var(--db-line-dashed)',
      borderRadius: 'var(--db-r-input)',
      padding: 20,
      textAlign: 'center',
      fontSize: 12.5,
      color: 'var(--db-text-3)',
      lineHeight: 1.6,
      ...style,
    }}
  >
    {children}
  </div>
)

/**
 * The shared floating surface. Closes on outside click, on Esc, and — because
 * the listener is global and every popover shares it — whenever another one
 * opens. Those are the handoff's three conditions, implemented once.
 */
const Popover: Kit['Popover'] = ({ open, onClose, anchor, align = 'left', direction = 'down', children, style }) => {
  const box = useRef<HTMLDivElement | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)
  const [eff, setEff] = useState<'down' | 'up'>(direction)
  // The effective direction after viewport measurement: the caller's preferred
  // direction, flipped when the floating surface would leave the window.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    // Capture phase: a click on another popover's trigger must close this one
    // before that trigger's own handler decides to open its menu.
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  useLayoutEffect(() => {
    if (!open) return
    const boxEl = box.current
    const panelEl = panel.current
    if (boxEl === null || panelEl === null) return
    const boxRect = boxEl.getBoundingClientRect()
    const panelRect = panelEl.getBoundingClientRect()
    // If the caller's direction is down but the panel would clip the window's
    // bottom, flip up; the mirror flips a bottom-anchored panel that clips
    // upward. `flip` re-measures after the direction change settles.
    let next = direction
    if (direction === 'down' && boxRect.bottom + panelRect.height + 14 > window.innerHeight) next = 'up'
    else if (direction === 'up' && boxRect.top - panelRect.height - 14 < 0) next = 'down'
    setEff(next)
  }, [open, direction, children])
  return (
    <div ref={box} style={{ position: 'relative', display: 'flex', minWidth: 0 }}>
      {anchor}
      {open && (
        <div
          ref={panel}
          className={eff === 'down' ? 'dbdy-pop' : 'dbdy-pop-up'}
          style={{
            position: 'absolute',
            ...eff === 'down' ? { top: '100%', marginTop: 6 } : { bottom: '100%', marginBottom: 6 },
            ...align === 'left' ? { left: 0 } : { right: 0 },
            zIndex: 30,
            background: 'var(--db-popover)',
            border: '1px solid var(--db-line-container)',
            borderRadius: 'var(--db-r-surface)',
            padding: 6,
            boxShadow: 'var(--db-shadow-popover)',
            ...style,
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}


// ── composites ──────────────────────────────────────────────────────────────

/** Above this many options a select menu grows a search row (COMPONENTS.md). */
const SEARCHABLE_AT = 8

/**
 * Select props, written out rather than derived from {@link Kit}: a
 * `Parameters<Kit['Select']>[0]` lookup instantiates the generic at `string`
 * and loses the caller's option union.
 */
interface SelectProps<T extends string> {
  value: T
  options: readonly { id: T; label: string; detail?: string }[]
  onChange: (v: T) => void
  form?: 'pill' | 'field'
  disabled?: boolean
  placeholder?: string
  title?: string
  style?: CSSProperties
}

function SelectImpl<T extends string>({ value, options, onChange, form = 'pill', disabled, placeholder, title, style }: SelectProps<T>): ReactNode {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const current = options.find(o => o.id === value)
  const q = query.trim().toLowerCase()
  const rows = q === '' ? options : options.filter(o => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))
  const field = form === 'field'
  const close = (): void => { setOpen(false); setQuery('') }
  return (
    <Popover
      open={open}
      onClose={close}
      style={{ minWidth: field ? 340 : 220, padding: 6 }}
      anchor={(
        <button
          type="button"
          {...title === undefined ? {} : { title }}
          disabled={disabled === true}
          onClick={() => { setOpen(!open) }}
          className="dbdy-hv-outline"
          style={{
            ...ROW,
            gap: 7,
            width: field ? 340 : undefined,
            height: field ? 42 : 32,
            padding: field ? '0 13px' : '0 11px',
            borderRadius: field ? 'var(--db-r-input)' : 16,
            border: `1px solid ${field ? 'var(--db-line-input-2)' : 'var(--db-line-input)'}`,
            background: field ? 'rgba(255,255,255,.04)' : 'transparent',
            color: current === undefined ? 'var(--db-text-4)' : 'var(--db-text)',
            fontSize: 13,
            cursor: disabled === true ? 'default' : 'pointer',
            opacity: disabled === true ? 0.45 : 1,
            whiteSpace: 'nowrap',
            transition: 'background var(--db-tint), border-color var(--db-tint)',
            ...style,
          }}
        >
          <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
            {current?.label ?? placeholder ?? ''}
          </span>
          <ChevronDown size={13} color="var(--db-text-3)" style={{ flex: '0 0 13px' }} />
        </button>
      )}
    >
      {options.length > SEARCHABLE_AT && (
        <div style={{ ...ROW, gap: 8, padding: '4px 8px 8px' }}>
          <Search size={14} color="var(--db-text-3)" />
          <input
            value={query}
            autoFocus
            onChange={(e) => { setQuery(e.target.value) }}
            placeholder="搜索"
            style={{
              flex: '1 1 auto', minWidth: 0, border: 0, background: 'transparent', outline: 'none',
              color: 'var(--db-text)', fontSize: 13,
            }}
          />
        </div>
      )}
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {rows.map(o => (
          <div
            key={o.id}
            onClick={() => { onChange(o.id); close() }}
            className="dbdy-hv-2"
            style={{
              ...ROW, gap: 8, minHeight: 34, padding: '6px 10px', borderRadius: 'var(--db-r-swatch)',
              cursor: 'pointer', background: o.id === value ? 'var(--db-fill-5)' : 'transparent',
              transition: 'background var(--db-tint)',
            }}
          >
            <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, color: 'var(--db-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
              {o.detail !== undefined && (
                <span style={{ fontSize: 11.5, color: 'var(--db-text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.detail}</span>
              )}
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <div style={{ padding: '10px 10px 6px', fontSize: 12.5, color: 'var(--db-text-4)' }}>没有匹配项</div>
        )}
      </div>
    </Popover>
  )
}

/** Tabs props — written out for the same reason as {@link SelectProps}. */
interface TabsProps<T extends string> {
  form: 'underline' | 'segment'
  value: T
  tabs: readonly { id: T; label: string; icon?: ReactNode }[]
  onChange: (v: T) => void
  title?: string
  style?: CSSProperties
}

function TabsImpl<T extends string>({ form, value, tabs, onChange, style }: TabsProps<T>): ReactNode {
  if (form === 'segment') {
    return (
      <div style={{ ...ROW, gap: 2, padding: 3, borderRadius: 'var(--db-r-swatch)', background: 'rgba(255,255,255,.04)', ...style }}>
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => { onChange(t.id) }}
            className={t.id === value ? undefined : 'dbdy-hv-2'}
            style={{
              ...ROW, gap: 7, height: 30, padding: '0 12px', border: 0, borderRadius: 8,
              background: t.id === value ? 'rgba(255,255,255,.10)' : 'transparent',
              color: t.id === value ? 'var(--db-text)' : 'var(--db-text-3)',
              fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'background var(--db-tint), color var(--db-tint)',
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    )
  }
  return (
    <div style={{ ...ROW, gap: 22, borderBottom: '1px solid var(--db-line)', ...style }}>
      {tabs.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => { onChange(t.id) }}
          style={{
            height: 38, border: 0, background: 'transparent', padding: 0, cursor: 'pointer',
            fontSize: 13.5, whiteSpace: 'nowrap',
            color: t.id === value ? 'var(--db-text)' : 'var(--db-text-3)',
            boxShadow: t.id === value ? 'inset 0 -2px 0 var(--db-text)' : 'none',
            transition: 'color var(--db-tint)',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Rail row metrics, transcribed from the prototype's `navBase` (31px tall,
 * 8px pad, radius 10, 1px between rows) and its thread rows (29 — folded into
 * one height here, because a kit exists exactly to stop a 2px disagreement).
 * Tree rows take `dense` (26).
 *
 * Public as constants so the kernel's own containers size their gutters
 * against the same numbers the rows are drawn with: 8px container + 8px row
 * gives the inset the handoff draws, and edge-to-edge rows are then impossible
 * by construction.
 */
export const ROW_METRICS = { height: 31, dense: 26, radius: 10, pad: 8, indent: 20, gutter: 8, gap: 1 } as const

const RowImpl: Kit['Row'] = ({ current, icon, trailing, indent, dense, onClick, title, style, children }) => (
  <div
    {...title === undefined ? {} : { title }}
    {...onClick === undefined
      ? {}
      : {
          onClick,
          // Clickable rows carry button semantics so the keyboard can reach
          // them (DESIGN_INTENT §12) — Enter/Space activate like a button.
          role: 'button',
          tabIndex: 0,
          onKeyDown: (e: { key: string, preventDefault(): void }) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onClick()
            }
          },
        }}
    className={current === true ? undefined : 'dbdy-hv-2'}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      height: dense === true ? ROW_METRICS.dense : ROW_METRICS.height,
      paddingLeft: ROW_METRICS.pad + (indent === true ? ROW_METRICS.indent : 0),
      paddingRight: ROW_METRICS.pad,
      borderRadius: ROW_METRICS.radius,
      cursor: onClick === undefined ? 'default' : 'pointer',
      fontSize: dense === true ? 12.5 : 13,
      color: current === true ? 'var(--db-text)' : 'var(--db-text-2)',
      background: current === true ? 'var(--db-fill-5)' : 'transparent',
      transition: 'background var(--db-tint)',
      ...style,
    }}
  >
    {icon !== undefined && (
      <span style={{ flex: '0 0 auto', display: 'flex', color: current === true ? 'var(--db-text)' : 'var(--db-text-3)' }}>
        {icon}
      </span>
    )}
    <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {children}
    </span>
    {trailing !== undefined && (
      <span style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--db-text-5)' }}>
        {trailing}
      </span>
    )}
  </div>
)

const GroupLabel: Kit['GroupLabel'] = ({ onClick, trailing, children, title, style }) => (
  <div
    {...title === undefined ? {} : { title }}
    {...onClick === undefined ? {} : { onClick }}
    style={{
      ...ROW,
      gap: 4,
      // The handoff separates groups with space above the label, not with a
      // row of its own height: 22 above, 6 below, no background, no rule.
      padding: `22px ${ROW_METRICS.pad}px 6px`,
      fontSize: 11.5,
      fontWeight: 500,
      color: 'var(--db-text-5)',
      cursor: onClick === undefined ? 'default' : 'pointer',
      ...style,
    }}
  >
    <span style={{ whiteSpace: 'nowrap' }}>{children}</span>
    {trailing !== undefined && <span style={{ display: 'flex', alignItems: 'center' }}>{trailing}</span>}
  </div>
)

const SettingRow: Kit['SettingRow'] = ({ label, description, children, style }) => (
  <div style={{
    ...ROW, gap: 24, padding: '17px 0', borderBottom: '1px solid rgba(255,255,255,.07)', ...style,
  }}
  >
    <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 13.5, color: 'var(--db-text)' }}>{label}</span>
      {description !== undefined && (
        <span style={{ fontSize: 12, color: 'var(--db-text-4)', lineHeight: 1.5 }}>{description}</span>
      )}
    </span>
    <span style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>{children}</span>
  </div>
)

/**
 * The kit instance handed to every seat. Frozen: an occupant that reassigns a
 * member would be redesigning the distribution from inside a panel.
 */
export const KIT: Kit = Object.freeze({
  Button,
  IconButton,
  Input,
  Select: SelectImpl,
  Switch,
  Badge,
  StatusPill,
  Card,
  Popover,
  EmptyState,
  Tabs: TabsImpl,
  Row: RowImpl,
  GroupLabel,
  SettingRow,
  Dot,
  Mono,
})
