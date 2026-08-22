/**
 * The plugins settings page: the read-only Loader inventory ("插件").
 *
 * Plugins are authored, changed and deleted through a 「创造模式」 session, not
 * edited here.
 */
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { pluginPhaseLabel } from '../../dsh/presets.ts'
import { useStore } from '../../dsh/hooks.ts'
import { useAppDeps } from '../../app/context.tsx'
import { KIT } from '../../ui/kit.tsx'

/**
 * The plugins settings page.
 */
export function PluginsPage(): ReactNode {
  const { settings } = useAppDeps()
  useStore(settings)
  useEffect(() => { void settings.loadPlugins() }, [])
  const s = settings.state
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12.5, color: 'var(--db-text-3)', lineHeight: 1.7, paddingBottom: 18 }}>
        当前 Loader 装配的插件条目（只读）。插件的创作、变更与删除通过「创造模式」会话进行，不在这里编辑。
      </div>
      {s.pluginsError !== null && (
        <div style={{ fontSize: 12.5, color: 'var(--db-await)', paddingBottom: 14 }}>{s.pluginsError}</div>
      )}
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
          <KIT.Dot
            tone={entry.fiberPhase === 'active' ? 'run' : entry.fiberPhase === 'failed' ? 'await' : 'muted'}
            size={7}
          />
          <KIT.Mono style={{ flex: '1 1 auto', minWidth: 0, fontSize: 12.5, color: 'var(--db-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.moduleName}
          </KIT.Mono>
          {!entry.enabled && <KIT.Badge>已停用</KIT.Badge>}
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
