/**
 * Diagnostic logging for the client. Two tiers:
 *
 * - {@link dblog} — verbose lifecycle tracing, OFF by default. Enable in
 *   DevTools with `localStorage.setItem('deepbuddy:debug', '1')` (all scopes)
 *   or a comma list like `'fence,terminal'`; takes effect immediately, no
 *   reload. Nothing prints in normal use, so hot paths may call it freely.
 * - {@link dbwarn} — anomalies, ALWAYS on. Reserved for events the UI
 *   otherwise swallows (a dropped socket, a failed embed): the console record
 *   is what a field report gets attached to.
 *
 * One prefix (`dbdy:<scope>`) so `[dbdy` filters the console down to us.
 */

function enabled(scope: string): boolean {
  let flag: string | null
  try { flag = window.localStorage.getItem('deepbuddy:debug') }
  catch { return false }
  if (flag === null || flag === '') return false
  if (flag === '1' || flag === '*') return true
  return flag.split(',').some(entry => entry.trim() === scope)
}

/** Verbose lifecycle trace; prints only when the scope is enabled. */
export function dblog(scope: string, message: string, detail?: unknown): void {
  if (!enabled(scope)) return
  if (detail === undefined) console.info(`[dbdy:${scope}] ${message}`)
  else console.info(`[dbdy:${scope}] ${message}`, detail)
}

/** Always-on anomaly record — for errors the UI absorbs into a quiet state. */
export function dbwarn(scope: string, message: string, detail?: unknown): void {
  if (detail === undefined) console.warn(`[dbdy:${scope}] ${message}`)
  else console.warn(`[dbdy:${scope}] ${message}`, detail)
}
