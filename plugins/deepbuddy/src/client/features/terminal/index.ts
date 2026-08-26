/** The session-scoped interactive terminal inspector view. */
import type { InspectorViewTypeDefinition } from '../../app/catalog.ts'
import { TerminalView, fenceTerminalSession } from './TerminalView.tsx'

export const TerminalViewDefinition: InspectorViewTypeDefinition = {
  id: 'terminal',
  title: '终端',
  icon: 'terminal',
  Component: TerminalView,
  onSessionFence: fenceTerminalSession,
}

export { TerminalView }
