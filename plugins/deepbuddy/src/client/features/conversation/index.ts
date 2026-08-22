/**
 * The conversation feature: the workbench's chat app and its sidebar entry.
 *
 * Everything public lives behind this index — the thin definition the catalog
 * composes, the nav row the sidebar draws, and the store the assembly
 * instantiates. Internals (the stream components) stay inside the feature
 * (deepbuddy-design-current/DEVELOPMENT_RULES.md §3).
 */
import type { WorkbenchAppDefinition } from '../../app/catalog.ts'
import { ChatNav, ChatView, CONVERSATION_APP_ID } from './Chat.tsx'

/** The conversation app's catalog definition. */
export const ConversationAppDefinition: WorkbenchAppDefinition = {
  id: CONVERSATION_APP_ID,
  title: '对话',
  Component: ChatView,
}

export { ChatNav, ChatView }
export { ConversationStore } from './store.ts'
