/**
 * Inline line-art icons on the handoff's drawing rules
 * (`COMPONENTS.md` §图标): 24 viewBox, round caps and joins, stroke 1.7 at
 * 13px and up, stroke 2 below — thin strokes disappear at small sizes, so the
 * weight compensates instead of the size being fudged.
 *
 * One glyph per semantic, globally: the same shape means "open a panel"
 * wherever it appears. Adding a second drawing for an existing meaning is the
 * bug this module exists to prevent.
 */
import type { CSSProperties, ReactNode } from 'react'

interface IconProps {
  /** Square icon size in px. */
  size?: number
  /** Stroke width override; defaults to the size rule (1.7 / 2). */
  sw?: number
  /** Stroke colour; defaults to currentColor so buttons tint their glyph. */
  color?: string
  /** Extra styles on the svg element (flex locks in rows). */
  style?: CSSProperties
}

/**
 * Draw one icon body under the shared rules.
 * @param content - the paths.
 * @param props - caller's size / stroke / colour / style.
 * @returns the svg element.
 */
function svg(content: ReactNode, { size = 16, sw, color = 'currentColor', style }: IconProps): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={sw ?? (size >= 13 ? 1.7 : 2)}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {content}
    </svg>
  )
}

// ── frame controls ──────────────────────────────────────────────────────────

export const PanelLeft = (p: IconProps): ReactNode =>
  svg(<><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9.5 4v16" /></>, p)

export const PanelRight = (p: IconProps): ReactNode =>
  svg(<><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M14.5 4v16" /></>, p)

/** Grow a panel to the full window. */
export const Expand = (p: IconProps): ReactNode =>
  svg(<><path d="M14 4h6v6" /><path d="M10 20H4v-6" /><path d="M20 4l-7 7" /><path d="M4 20l7-7" /></>, p)

/** Return a maximized panel to its share. */
export const Collapse = (p: IconProps): ReactNode =>
  svg(<><path d="M20 10h-6V4" /><path d="M4 14h6v6" /><path d="M14 10l6-6" /><path d="M10 14l-6 6" /></>, p)

// ── navigation ──────────────────────────────────────────────────────────────

/** New thread. */
export const Compose = (p: IconProps): ReactNode =>
  svg(<><path d="M12.5 4.5H5.5A1.5 1.5 0 004 6v12.5A1.5 1.5 0 005.5 20H18a1.5 1.5 0 001.5-1.5v-7" /><path d="M17.2 3.8a1.9 1.9 0 012.7 2.7L13 13.4l-3.4.7.7-3.4z" /></>, p)

export const Kanban = (p: IconProps): ReactNode =>
  svg(<><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9.2 4.5v15" /><path d="M14.8 4.5v15" /></>, p)

export const PullRequest = (p: IconProps): ReactNode =>
  svg(<><circle cx="6.5" cy="6" r="2.2" /><circle cx="6.5" cy="18" r="2.2" /><path d="M6.5 8.2v7.6" /><circle cx="17.5" cy="18" r="2.2" /><path d="M17.5 15.8V9.5a2.5 2.5 0 00-2.5-2.5h-3.2" /><path d="M13.6 4.8L11.4 7l2.2 2.2" /></>, p)

export const Automation = (p: IconProps): ReactNode =>
  svg(<><circle cx="12" cy="12" r="8" /><path d="M12 7.4V12l3 1.8" /></>, p)

export const Folder = (p: IconProps): ReactNode =>
  svg(<path d="M3.5 6.8a1.8 1.8 0 011.8-1.8h3.3l1.9 2h7.7a1.8 1.8 0 011.8 1.8v8.4a1.8 1.8 0 01-1.8 1.8H5.3a1.8 1.8 0 01-1.8-1.8z" />, p)

export const FileText = (p: IconProps): ReactNode =>
  svg(<><path d="M13.5 3.5H7a1.8 1.8 0 00-1.8 1.8v13.4A1.8 1.8 0 007 20.5h10a1.8 1.8 0 001.8-1.8V8.8z" /><path d="M13.5 3.5v5.3h5.3" /></>, p)

export const Gear = (p: IconProps): ReactNode =>
  svg(<><circle cx="12" cy="12" r="3" /><path d="M19.2 14.4a1.5 1.5 0 00.3 1.7l.1.1a1.8 1.8 0 11-2.6 2.6l-.1-.1a1.5 1.5 0 00-2.6 1.1v.2a1.8 1.8 0 11-3.6 0v-.1a1.5 1.5 0 00-2.6-1.1l-.1.1a1.8 1.8 0 11-2.6-2.6l.1-.1a1.5 1.5 0 00-1.1-2.6h-.2a1.8 1.8 0 110-3.6h.1a1.5 1.5 0 001.1-2.6l-.1-.1A1.8 1.8 0 117.8 4.7l.1.1a1.5 1.5 0 001.7.3h.1A1.5 1.5 0 0010.6 3.8v-.2a1.8 1.8 0 113.6 0v.1a1.5 1.5 0 002.6 1.1l.1-.1a1.8 1.8 0 112.6 2.6l-.1.1a1.5 1.5 0 00-.3 1.7v.1a1.5 1.5 0 001.4.9h.2a1.8 1.8 0 010 3.6h-.1a1.5 1.5 0 00-1.4.9z" /></>, p)

export const Help = (p: IconProps): ReactNode =>
  svg(<><circle cx="12" cy="12" r="8.2" /><path d="M9.8 9.6a2.3 2.3 0 114.1 1.5c-.7.8-1.6 1.2-1.6 2.3" /><path d="M12 16.8h.01" /></>, p)

// ── dock surfaces ───────────────────────────────────────────────────────────

export const Explorer = (p: IconProps): ReactNode =>
  svg(<><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9.5 4.5v15" /><path d="M12 9h5.5" /><path d="M12 13h5.5" /></>, p)

export const Globe = (p: IconProps): ReactNode =>
  svg(<><circle cx="12" cy="12" r="8.2" /><path d="M3.8 12h16.4" /><path d="M12 3.8c2.1 2.2 3.2 5.1 3.2 8.2s-1.1 6-3.2 8.2c-2.1-2.2-3.2-5.1-3.2-8.2s1.1-6 3.2-8.2z" /></>, p)

export const Terminal = (p: IconProps): ReactNode =>
  svg(<><rect x="3.2" y="4.5" width="17.6" height="15" rx="2.2" /><path d="M7.8 10l2.6 2.4-2.6 2.4" /><path d="M12.8 15.2h3.6" /></>, p)

export const Sliders = (p: IconProps): ReactNode =>
  svg(<><path d="M4 8h10" /><path d="M18 8h2" /><circle cx="16" cy="8" r="2" /><path d="M4 16h4" /><path d="M12 16h8" /><circle cx="10" cy="16" r="2" /></>, p)

export const Git = (p: IconProps): ReactNode =>
  svg(<><circle cx="7" cy="6" r="2.2" /><circle cx="7" cy="18" r="2.2" /><circle cx="17" cy="12" r="2.2" /><path d="M7 8.2v7.6" /><path d="M14.8 12H12a5 5 0 01-5-5" /></>, p)

// ── input & actions ─────────────────────────────────────────────────────────

export const Search = (p: IconProps): ReactNode =>
  svg(<><circle cx="11" cy="11" r="6.6" /><path d="M20 20l-4.3-4.3" /></>, p)

export const Plus = (p: IconProps): ReactNode =>
  svg(<path d="M12 5.5v13M5.5 12h13" />, p)

export const Close = (p: IconProps): ReactNode =>
  svg(<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />, p)

export const Check = (p: IconProps): ReactNode =>
  svg(<path d="M5.5 12.5l4.2 4.2 8.8-9.4" />, p)

export const ArrowUp = (p: IconProps): ReactNode =>
  svg(<path d="M12 19V5.6M6 11.4l6-6 6 6" />, p)

export const ArrowLeft = (p: IconProps): ReactNode =>
  svg(<path d="M19 12H5.4M11 5.4L4.6 12l6.4 6.6" />, p)

export const ArrowRight = (p: IconProps): ReactNode =>
  svg(<path d="M5 12h13.6M13 5.4l6.4 6.6-6.4 6.6" />, p)

export const ChevronDown = (p: IconProps): ReactNode =>
  svg(<path d="M6.5 9.5l5.5 5.4 5.5-5.4" />, p)

export const ChevronUp = (p: IconProps): ReactNode =>
  svg(<path d="M6.5 14.5l5.5-5.4 5.5 5.4" />, p)

export const ChevronRight = (p: IconProps): ReactNode =>
  svg(<path d="M9.5 6.5l5.4 5.5-5.4 5.5" />, p)

export const Mic = (p: IconProps): ReactNode =>
  svg(<><rect x="9.4" y="3.4" width="5.2" height="10.4" rx="2.6" /><path d="M5.6 11.6a6.4 6.4 0 0012.8 0" /><path d="M12 18v2.6" /></>, p)

export const Stop = (p: IconProps): ReactNode =>
  svg(<rect x="7.5" y="7.5" width="9" height="9" rx="1.6" />, p)

export const Refresh = (p: IconProps): ReactNode =>
  svg(<><path d="M19.6 12a7.6 7.6 0 11-2.4-5.6" /><path d="M19.6 4.4V9h-4.6" /></>, p)

export const Copy = (p: IconProps): ReactNode =>
  svg(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15.4 5.6A1.8 1.8 0 0013.6 4H5.8A1.8 1.8 0 004 5.8v7.8a1.8 1.8 0 001.6 1.8" /></>, p)

export const Trash = (p: IconProps): ReactNode =>
  svg(<><path d="M4.6 6.8h14.8" /><path d="M9.4 6.8V5.2a1.4 1.4 0 011.4-1.4h2.4a1.4 1.4 0 011.4 1.4v1.6" /><path d="M6.6 6.8l.8 12a1.6 1.6 0 001.6 1.4h6a1.6 1.6 0 001.6-1.4l.8-12" /></>, p)

export const Eye = (p: IconProps): ReactNode =>
  svg(<><path d="M2.6 12S6.2 5.8 12 5.8 21.4 12 21.4 12 17.8 18.2 12 18.2 2.6 12 2.6 12z" /><circle cx="12" cy="12" r="2.8" /></>, p)

export const EyeOff = (p: IconProps): ReactNode =>
  svg(<><path d="M9.6 6.2A8.9 8.9 0 0112 6c5.8 0 9.4 6 9.4 6a16 16 0 01-3.2 3.9" /><path d="M6.3 7.9A16 16 0 002.6 12s3.6 6 9.4 6a8.8 8.8 0 003.5-.7" /><path d="M4 4l16 16" /></>, p)

export const AlertCircle = (p: IconProps): ReactNode =>
  svg(<><circle cx="12" cy="12" r="8.2" /><path d="M12 8v4.6" /><path d="M12 16h.01" /></>, p)

export const Dots = (p: IconProps): ReactNode =>
  svg(<><path d="M6 12h.01" /><path d="M12 12h.01" /><path d="M18 12h.01" /></>, p)
