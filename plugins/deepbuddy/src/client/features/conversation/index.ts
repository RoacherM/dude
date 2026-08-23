/**
 * The conversation feature: the sidebar's new-task entry and the store the
 * assembly instantiates. The main-column chat render is the official
 * ui-conversation `ConversationRoot` (wave 8), so DeepBuddy contributes only
 * the new-task button (which starts a session) and the store's session-list
 * observation.
 */
import { ChatNav, CONVERSATION_APP_ID } from './Chat.tsx'

export { ChatNav, CONVERSATION_APP_ID }
export { ConversationStore } from './store.ts'
