/**
 * The modes settings page: the agent-preset roster ("模式").
 *
 * Renders from the shared preset plane; the copy form and the delete
 * confirmation are settings-local. Creating a preset is deliberately not a
 * form here: authoring happens in a `cordis`-mode session, which is what
 * 「新建模式」 starts.
 */
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { PresetPlane } from '../../dsh/presets.ts'
import type { AgentPresetEntry } from '../../dsh/presets.ts'
import { canAuthorPresets, canRemovePreset, copyIdBlocker, presetLabel } from '../../dsh/presets.ts'
import { useStore } from '../../dsh/hooks.ts'
import { useAppDeps } from '../../app/context.tsx'
import type { SettingsStore } from './store.ts'
import { KIT } from '../../ui/kit.tsx'
import { Plus } from '../../ui/icons.tsx'

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
function PresetRow({ settings, presets, entry }: {
  settings: SettingsStore
  presets: PresetPlane
  entry: AgentPresetEntry
}): ReactNode {
  const s = settings.state
  const busy = presets.state.presetBusy
  const pendingDelete = s.pendingDelete === entry.id
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 7, padding: '15px 0',
      borderBottom: '1px solid rgba(255,255,255,.07)',
    }}
    >
      <div className="dbdy-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <KIT.Dot tone={entry.isDefault ? 'primary' : 'muted'} size={7} />
        <span style={{ fontSize: 13.5, color: 'var(--db-text)' }}>{presetLabel(entry)}</span>
        {entry.isDefault && <KIT.Badge tone="outline">默认</KIT.Badge>}
        <KIT.Badge>{entry.trust === 'user' ? '本地' : '内置'}</KIT.Badge>
        {entry.broken !== undefined && <KIT.Badge tone="await">不可用</KIT.Badge>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {!entry.isDefault && entry.broken === undefined && (
            <KIT.Button kind="text" disabled={busy} onClick={() => { presets.makeDefaultPreset(entry.id) }}>
              设为默认
            </KIT.Button>
          )}
          {canAuthorPresets(presets.state.roster) && (
            <KIT.Button kind="text" disabled={busy} onClick={() => { settings.beginCopyPreset(entry.id) }}>
              复制
            </KIT.Button>
          )}
          {canRemovePreset(entry) && (
            <KIT.Button
              kind="text"
              disabled={busy}
              onClick={() => { settings.confirmDeletePreset(pendingDelete ? null : entry.id) }}
              style={{ color: 'var(--db-await)' }}
            >
              删除
            </KIT.Button>
          )}
        </span>
      </div>
      {entry.description !== undefined && (
        <div style={{ fontSize: 12, color: 'var(--db-text-4)', lineHeight: 1.6 }}>{entry.description}</div>
      )}
      {entry.broken !== undefined && (
        <div style={{ fontSize: 12, color: 'var(--db-await)', lineHeight: 1.6 }}>{entry.broken}</div>
      )}
      <KIT.Mono>{entry.id}</KIT.Mono>
      {/* Destructive confirmation is the handoff's one legitimate dialog. */}
      <KIT.Dialog open={pendingDelete} onClose={() => { settings.confirmDeletePreset(null) }} width={420}>
        <div style={{ padding: '20px 22px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--db-text)' }}>{`删除模式 ${presetLabel(entry)}？`}</span>
          <span style={{ fontSize: 12.5, color: 'var(--db-text-3)', lineHeight: 1.7 }}>
            删除后不可恢复；已用它开过的会话继续按原组合运行。
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '0 22px 20px' }}>
          <KIT.Button onClick={() => { settings.confirmDeletePreset(null) }}>取消</KIT.Button>
          <KIT.Button kind="primary" disabled={busy} onClick={settings.removePreset}>
            {busy ? '删除中…' : '删除'}
          </KIT.Button>
        </div>
      </KIT.Dialog>
    </div>
  )
}

/** The copy form, inline under the roster while a source row is named. */
function CopyForm({ settings, presets }: { settings: SettingsStore; presets: PresetPlane }): ReactNode {
  const draft = settings.state.copy
  const roster = presets.state.roster
  if (draft === null || roster === null) return null
  const blocker = draft.id.trim() === '' ? undefined : copyIdBlocker(draft.id, roster)
  return (
    <KIT.Card style={{ padding: 18, marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span style={{ fontSize: 12.5, color: 'var(--db-text-3)' }}>{`复制自 ${draft.from}`}</span>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ fontSize: 12.5, color: 'var(--db-text-2)' }}>新模式 id（小写字母、数字、连字符）</span>
        <KIT.Input
          value={draft.id}
          mono
          autoFocus
          size={44}
          placeholder="my-mode"
          onChange={(v) => { settings.patchCopy({ id: v, error: null }) }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ fontSize: 12.5, color: 'var(--db-text-2)' }}>显示名称（留空则用 id）</span>
        <KIT.Input value={draft.name} size={44} placeholder="我的模式" onChange={(v) => { settings.patchCopy({ name: v }) }} />
      </label>
      {(draft.error ?? blocker) !== undefined && (
        <span style={{ fontSize: 12.5, color: 'var(--db-await)' }}>{draft.error ?? blocker}</span>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <KIT.Button kind="primary" disabled={draft.saving} onClick={settings.confirmCopyPreset}>
          {draft.saving ? '复制中…' : '复制'}
        </KIT.Button>
        <KIT.Button onClick={settings.cancelCopyPreset}>取消</KIT.Button>
      </div>
    </KIT.Card>
  )
}

/**
 * The modes settings page.
 */
export function ModesPage(): ReactNode {
  const { presets, settings } = useAppDeps()
  useStore(presets)
  useStore(settings)
  useEffect(() => { void presets.loadRoster() }, [])
  const s = presets.state
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
        <KIT.EmptyState>这个部署没有配置任何模式，所有会话共用宿主组合。</KIT.EmptyState>
      )}
      {roster?.presets.map(entry => <PresetRow key={entry.id} settings={settings} presets={presets} entry={entry} />)}
      <CopyForm settings={settings} presets={presets} />
      {canAuthorPresets(roster) && settings.state.copy === null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 20 }}>
          <KIT.Button onClick={presets.startCreatorSession}>
            <Plus size={14} />
            新建模式
          </KIT.Button>
          <span style={{ flex: '1 1 auto', fontSize: 12, color: 'var(--db-text-4)', lineHeight: 1.6 }}>
            新建会开一个「创造模式」会话——在对话里描述要什么，由它写出 preset 目录。
          </span>
        </div>
      )}
    </div>
  )
}
