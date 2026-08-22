/**
 * The settings feature's data plane.
 *
 * Owns the settings-local UI state — the copy-a-preset draft, the pending
 * delete confirmation, and the Loader inventory for the plugins page. The
 * roster itself lives on the shared preset plane (dsh/presets.ts), which both
 * settings and the conversation mode chip render from; every preset write is
 * a plane action so one `presetBusy` guards them all. One instance per plugin
 * fiber.
 */
import type { Dsh } from '../../dsh/adapter.ts'
import type { PluginInventory } from '../../dsh/presets.ts'
import { copyIdBlocker } from '../../dsh/presets.ts'
import type { PresetPlane } from '../../dsh/presets.ts'

/** The copy-a-preset draft, live only while a source row is named. */
export interface PresetCopyDraft {
  from: string
  id: string
  name: string
  saving: boolean
  error: string | null
}

/** Everything the settings pages render from. */
export interface SettingsState {
  copy: PresetCopyDraft | null
  /** The preset id awaiting delete confirmation. */
  pendingDelete: string | null
  /** Loader inventory for the plugins settings page. */
  plugins: PluginInventory | null
  pluginsError: string | null
}

/** A state update in the shape the ported actions were written against. */
type StateUpdate = Partial<SettingsState> | null

/** The settings store: one per plugin fiber. */
export class SettingsStore {
  state: SettingsState = {
    copy: null,
    pendingDelete: null,
    plugins: null,
    pluginsError: null,
  }

  /** The wire bundle every action dispatches through. */
  readonly dsh: Dsh
  /** The shared preset plane (roster, busy flag, staged pick). */
  readonly presets: PresetPlane

  private readonly listeners = new Set<() => void>()
  private version = 0

  /**
   * @param dsh - the client wire bundle.
   * @param presets - the shared preset plane.
   */
  constructor(dsh: Dsh, presets: PresetPlane) {
    this.dsh = dsh
    this.presets = presets
  }

  /**
   * Replace state and notify.
   * @param update - partial patch, or an updater that returns null to decline.
   * @param after - callback run once the new state is committed.
   */
  setState(update: StateUpdate | ((prev: SettingsState) => StateUpdate), after?: () => void): void {
    const next = typeof update === 'function' ? update(this.state) : update
    if (next !== null) {
      this.state = { ...this.state, ...next }
      this.version += 1
      for (const listener of this.listeners) listener()
    }
    after?.()
  }

  patch = (p: Partial<SettingsState>, after?: () => void): void => {
    this.setState(p, after)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getVersion = (): number => this.version

  // ── copy form ─────────────────────────────────────────────────────────────

  beginCopyPreset = (from: string): void => {
    this.setState({ copy: { from, id: '', name: '', saving: false, error: null }, pendingDelete: null })
  }

  patchCopy = (patch: Partial<PresetCopyDraft>): void => {
    this.setState(x => (x.copy === null ? null : { copy: { ...x.copy, ...patch } }))
  }

  cancelCopyPreset = (): void => {
    this.setState({ copy: null })
  }

  /** Submit the copy, then re-read so the new row appears with its trust. */
  confirmCopyPreset = (): void => {
    const draft = this.state.copy
    const roster = this.presets.state.roster
    if (draft === null || draft.saving || roster === null) return
    const blocker = copyIdBlocker(draft.id, roster)
    if (blocker !== undefined) {
      this.patchCopy({ error: blocker })
      return
    }
    this.patchCopy({ saving: true, error: null })
    void (async () => {
      const r = await this.dsh.presets.copy(draft.from, draft.id.trim(), draft.name)
      if (!r.ok) {
        this.patchCopy({ saving: false, error: r.error })
        return
      }
      this.setState({ copy: null })
      await this.presets.loadRoster()
    })()
  }

  // ── delete confirmation ───────────────────────────────────────────────────

  confirmDeletePreset = (agentPreset: string | null): void => {
    this.setState({ pendingDelete: agentPreset, copy: null })
  }

  /** Delete the preset awaiting confirmation; the plane guards the write. */
  removePreset = (): void => {
    const agentPreset = this.state.pendingDelete
    if (agentPreset === null) return
    void this.presets.removePreset(agentPreset).then(() => { this.setState({ pendingDelete: null }) })
  }

  // ── plugin inventory ──────────────────────────────────────────────────────

  /** Read the Loader inventory for the plugins settings page. */
  loadPlugins = async (): Promise<void> => {
    const wire = this.dsh.plugins
    if (wire === null) {
      this.setState({ plugins: null, pluginsError: '插件清单服务未装配（remote.pluginInventory 缺席）' })
      return
    }
    const r = await wire.list()
    if (!r.ok) {
      this.setState({ pluginsError: r.error })
      return
    }
    this.setState({ plugins: r.value, pluginsError: null })
  }
}
