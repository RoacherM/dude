/**
 * The conversation feature's sidebar entry: the full-width new-task button.
 *
 * The main-column chat render is the official ui-conversation `ConversationRoot`
 * (wave 8) — DeepBuddy contributes only the new-task button that starts a
 * session. Everything else that used to render here (the self-built stream,
 * composer, chips and hero) is retired with the official takeover.
 */
import type { ReactNode } from 'react'
import { useAppDeps } from '../../app/context.tsx'
import { Compose } from '../../ui/icons.tsx'

/** The app's catalog id; the sidebar new-task button reveals it. */
export const CONVERSATION_APP_ID = 'chat'

/** The new-task button shown under the sidebar brand. */
export function ChatNav(): ReactNode {
  const { dsh, layout } = useAppDeps()
  const newTask = (): void => {
    // Reveal the conversation the new session lands in — same rule as
    // clicking a session row (FEATURE_MAP §2).
    layout.setView(CONVERSATION_APP_ID)
    dsh.workspaces.startSession()
  }
  return (
    <button
      type="button"
      onClick={newTask}
      className="dbdy-hv-1"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
        height: 38, padding: '8px 16px', borderRadius: 12,
        background: 'var(--dsw-alias-bg-raised, #43454a)',
        color: 'var(--db-text)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
        transition: 'background var(--db-tint), border-color var(--db-tint)',
      }}
    >
      <Compose size={16} style={{ flex: '0 0 16px', color: 'var(--db-text-3)' }} />
      <span>新建任务</span>
    </button>
  )
}
