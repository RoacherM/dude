/**
 * The two settings pages DeepBuddy ships today, seated in
 * `dbdy.settings.page`: the agent-preset roster ("模式") and the read-only
 * Loader inventory ("插件").
 *
 * Both were a two-tab modal before; the tabs are gone because the rail in the
 * settings shell already is the tab bar, and two navigations at one level is
 * the thing the handoff's tab rule forbids.
 *
 * Creating a preset or a plugin is deliberately not a form here: authoring
 * happens in a `cordis`-mode session, which is what 「新建模式」 starts. That
 * is also the loop M3 closes with its own approval surface.
 */
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { SeatProps } from '../seats.ts'
import type { AppStore } from '../store.ts'
import type { AgentPresetEntry } from '../presets.ts'
import { canAuthorPresets, canRemovePreset, copyIdBlocker, pluginPhaseLabel, presetLabel } from '../presets.ts'
import { useStore } from './store-hook.ts'
import { Plus } from '../icons.tsx'

/** Section intro copy: one paragraph, muted, above the rows. */
function Intro({ children }: { children: ReactNode }): ReactNode {
  return (
    <div style={{ fontSize: 12.5, color: 'var(--db-text-3)', lineHeight: 1.7, paddingBottom: 18 }}>{children}</div>
  )
}

function Failure({ children }: { children: ReactNode }): ReactNode {
  return <div style={{ fontSize: 12.5, color: 'var(--db-await)', paddingBottom: 14 }}>{children}</div>
}

/** One roster row: name, marks, description, id, and its controls. */
function PresetRow({ store, ui, entry }: { store: AppStore; ui: SeatProps['ui']; entry: AgentPresetEntry }): ReactNode {
  const s = store.state
  const pendingDelete = s.pendingDelete === entry.id
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 7, padding: '15px 0',
      borderBottom: '1px solid rgba(255,255,255,.07)',
    }}
    >
      <div className="dbdy-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ui.Dot tone={entry.isDefault ? 'primary' : 'muted'} size={7} />
        <span style={{ fontSize: 13.5, color: 'var(--db-text)' }}>{presetLabel(entry)}</span>
        {entry.isDefault && <ui.Badge tone="outline">默认</ui.Badge>}
        <ui.Badge>{entry.trust === 'user' ? '本地' : '内置'}</ui.Badge>
        {entry.broken !== undefined && <ui.Badge tone="await">不可用</ui.Badge>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {!entry.isDefault && entry.broken === undefined && (
            <ui.Button kind="text" disabled={s.presetBusy} onClick={() => { store.makeDefaultPreset(entry.id) }}>
              设为默认
            </ui.Button>
          )}
          {canAuthorPresets(s.roster) && (
            <ui.Button kind="text" disabled={s.presetBusy} onClick={() => { store.beginCopyPreset(entry.id) }}>
              复制
            </ui.Button>
          )}
          {canRemovePreset(entry) && (
            <ui.Button
              kind="text"
              disabled={s.presetBusy}
              onClick={() => { store.confirmDeletePreset(pendingDelete ? null : entry.id) }}
              style={{ color: 'var(--db-await)' }}
            >
              删除
            </ui.Button>
          )}
        </span>
      </div>
      {entry.description !== undefined && (
        <div style={{ fontSize: 12, color: 'var(--db-text-4)', lineHeight: 1.6 }}>{entry.description}</div>
      )}
      {entry.broken !== undefined && (
        <div style={{ fontSize: 12, color: 'var(--db-await)', lineHeight: 1.6 }}>{entry.broken}</div>
      )}
      <ui.Mono>{entry.id}</ui.Mono>
      {/* Destructive confirmation is the handoff's one legitimate dialog. */}
      <ui.Dialog open={pendingDelete} onClose={() => { store.confirmDeletePreset(null) }} width={420}>
        <div style={{ padding: '20px 22px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--db-text)' }}>{`删除模式 ${presetLabel(entry)}？`}</span>
          <span style={{ fontSize: 12.5, color: 'var(--db-text-3)', lineHeight: 1.7 }}>
            删除后不可恢复；已用它开过的会话继续按原组合运行。
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '0 22px 20px' }}>
          <ui.Button onClick={() => { store.confirmDeletePreset(null) }}>取消</ui.Button>
          <ui.Button kind="primary" disabled={s.presetBusy} onClick={store.removePreset}>
            {s.presetBusy ? '删除中…' : '删除'}
          </ui.Button>
        </div>
      </ui.Dialog>
    </div>
  )
}

/** The copy form, inline under the roster while a source row is named. */
function CopyForm({ store, ui }: { store: AppStore; ui: SeatProps['ui'] }): ReactNode {
  const draft = store.state.copy
  const roster = store.state.roster
  if (draft === null || roster === null) return null
  const blocker = draft.id.trim() === '' ? undefined : copyIdBlocker(draft.id, roster)
  return (
    <ui.Card style={{ padding: 18, marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span style={{ fontSize: 12.5, color: 'var(--db-text-3)' }}>{`复制自 ${draft.from}`}</span>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ fontSize: 12.5, color: 'var(--db-text-2)' }}>新模式 id（小写字母、数字、连字符）</span>
        <ui.Input
          value={draft.id}
          mono
          autoFocus
          size={44}
          placeholder="my-mode"
          onChange={(v) => { store.patchCopy({ id: v, error: null }) }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ fontSize: 12.5, color: 'var(--db-text-2)' }}>显示名称（留空则用 id）</span>
        <ui.Input value={draft.name} size={44} placeholder="我的模式" onChange={(v) => { store.patchCopy({ name: v }) }} />
      </label>
      {(draft.error ?? blocker) !== undefined && (
        <span style={{ fontSize: 12.5, color: 'var(--db-await)' }}>{draft.error ?? blocker}</span>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <ui.Button kind="primary" disabled={draft.saving} onClick={store.confirmCopyPreset}>
          {draft.saving ? '复制中…' : '复制'}
        </ui.Button>
        <ui.Button onClick={store.cancelCopyPreset}>取消</ui.Button>
      </div>
    </ui.Card>
  )
}

/**
 * Build the modes settings page.
 * @param store - the temporary occupants' data plane.
 * @returns the component to register into `dbdy.settings.page`.
 */
export function createModesPage(store: AppStore): (props: SeatProps) => ReactNode {
  return function ModesPage({ ui }: SeatProps): ReactNode {
    useStore(store)
    useEffect(() => { void store.loadRoster() }, [])
    const s = store.state
    const roster = s.roster
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Intro>
          模式决定一个会话的工具、提示词与技能目录。默认模式只影响之后新建的会话，运行中的会话保持开始时的组合。
        </Intro>
        {s.presetError !== null && <Failure>{s.presetError}</Failure>}
        {roster === null && s.presetError === null && (
          <div style={{ fontSize: 12.5, color: 'var(--db-text-4)' }}>加载模式清单…</div>
        )}
        {roster !== null && roster.presets.length === 0 && (
          <ui.EmptyState>这个部署没有配置任何模式，所有会话共用宿主组合。</ui.EmptyState>
        )}
        {roster?.presets.map(entry => <PresetRow key={entry.id} store={store} ui={ui} entry={entry} />)}
        <CopyForm store={store} ui={ui} />
        {canAuthorPresets(roster) && s.copy === null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 20 }}>
            <ui.Button onClick={store.startCreatorSession}>
              <Plus size={14} />
              新建模式
            </ui.Button>
            <span style={{ flex: '1 1 auto', fontSize: 12, color: 'var(--db-text-4)', lineHeight: 1.6 }}>
              新建会开一个「创造模式」会话——在对话里描述要什么，由它写出 preset 目录。
            </span>
          </div>
        )}
      </div>
    )
  }
}

/**
 * Build the plugins settings page.
 * @param store - the temporary occupants' data plane.
 * @returns the component to register into `dbdy.settings.page`.
 */
export function createPluginsPage(store: AppStore): (props: SeatProps) => ReactNode {
  return function PluginsPage({ ui }: SeatProps): ReactNode {
    useStore(store)
    useEffect(() => { void store.loadPlugins() }, [])
    const s = store.state
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Intro>
          当前 Loader 装配的插件条目（只读）。插件的创作、变更与删除通过「创造模式」会话进行，不在这里编辑。
        </Intro>
        {s.pluginsError !== null && <Failure>{s.pluginsError}</Failure>}
        {s.plugins === null && s.pluginsError === null && (
          <div style={{ fontSize: 12.5, color: 'var(--db-text-4)' }}>加载插件清单…</div>
        )}
        {s.plugins?.entries.map(entry => (
          <div
            key={entry.entryId as string}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '13px 0',
              borderBottom: '1px solid rgba(255,255,255,.07)',
            }}
          >
            <ui.Dot
              tone={entry.fiberPhase === 'active' ? 'run' : entry.fiberPhase === 'failed' ? 'await' : 'muted'}
              size={7}
            />
            <ui.Mono style={{ flex: '1 1 auto', minWidth: 0, fontSize: 12.5, color: 'var(--db-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.moduleName}
            </ui.Mono>
            {!entry.enabled && <ui.Badge>已停用</ui.Badge>}
            <span style={{
              flex: '0 0 auto', fontSize: 11.5, whiteSpace: 'nowrap',
              color: entry.fiberPhase === 'failed' ? 'var(--db-await)' : 'var(--db-text-5)',
            }}
            >
              {pluginPhaseLabel(entry)}
            </span>
          </div>
        ))}
        {s.plugins !== null && (
          <div style={{ paddingTop: 14, fontSize: 11.5, color: 'var(--db-text-5)' }}>{`共 ${s.plugins.entries.length} 条`}</div>
        )}
      </div>
    )
  }
}
