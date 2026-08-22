/**
 * The Models settings page: provider / model directory, default-model picker,
 * and per-provider credential configuration.
 *
 * Reads through the shared models plane (dsh/models.ts); the page owns only
 * the local edit drafts (default-model pick, API-key text). API keys are
 * write-only: the field holds a fresh draft, an existing key shows only
 * 「已配置」, and the value is never rendered back.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ModelSelection, ProviderRow } from '../../dsh/models.ts'
import { useStore } from '../../dsh/hooks.ts'
import { useAppDeps } from '../../app/context.tsx'
import { KIT } from '../../ui/kit.tsx'

function Intro({ children }: { children: ReactNode }): ReactNode {
  return (
    <div style={{ fontSize: 12.5, color: 'var(--db-text-3)', lineHeight: 1.7, paddingBottom: 18 }}>{children}</div>
  )
}

function Failure({ children }: { children: ReactNode }): ReactNode {
  return <div style={{ fontSize: 12.5, color: 'var(--db-await)', paddingBottom: 14 }}>{children}</div>
}

/** One provider row: display name, credential state, base URL, and its models. */
function ProviderCard({ row, onSaveKey }: { row: ProviderRow; onSaveKey: (keyRef: string, value: string) => Promise<string | null> }): ReactNode {
  const [keyDraft, setKeyDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <KIT.Card style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--db-text)' }}>{row.view.displayName}</span>
        <KIT.Mono style={{ fontSize: 11.5 }}>{row.view.provider}</KIT.Mono>
        {row.view.active ? <KIT.Badge tone="run">已启用</KIT.Badge> : <KIT.Badge tone="neutral">未启用</KIT.Badge>}
        <span style={{ flex: '1 1 auto' }} />
        {row.keyRef !== null && (
          <span style={{ fontSize: 12, color: row.credential?.configured ? 'var(--db-text-2)' : 'var(--db-await)' }}>
            {row.credential?.configured ? '已配置' : '未配置'}
          </span>
        )}
      </div>
      {row.baseURL !== null && (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--db-text-4)' }}>
          端点 <KIT.Mono>{row.baseURL}</KIT.Mono>
        </div>
      )}
      {row.keyRef !== null && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="password"
            value={keyDraft}
            onChange={(e) => { setKeyDraft(e.target.value); setError(null) }}
            placeholder={row.credential?.configured ? '已配置 — 输入新值以替换' : `输入 API Key（${row.keyRef}）`}
            style={{
              flex: '1 1 220px', height: 32, padding: '0 10px', borderRadius: 8,
              border: '1px solid var(--db-line-input)', background: 'var(--db-fill-3)',
              color: 'var(--db-text)', fontSize: 13,
            }}
          />
          <KIT.Button
            kind="secondary"
            disabled={busy || keyDraft.trim() === ''}
            onClick={() => {
              const value = keyDraft.trim()
              if (value === '' || busy) return
              setBusy(true)
              void (async () => {
                const failure = await onSaveKey(row.keyRef as string, value)
                setBusy(false)
                if (failure !== null) { setError(failure); return }
                setKeyDraft('')
              })()
            }}
          >
            保存
          </KIT.Button>
        </div>
      )}
      {error !== null && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--db-await)' }}>{error}</div>}
      <div style={{ marginTop: 10 }}>
        {row.models.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--db-text-4)' }}>该 provider 未公开模型</div>
        ) : (
          row.models.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12.5 }}>
              <span style={{ color: 'var(--db-text)' }}>{m.name}</span>
              <KIT.Mono style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.id}</KIT.Mono>
              {m.reasoning !== undefined && m.reasoning.efforts.length > 0 && (
                <span style={{ fontSize: 11.5, color: 'var(--db-text-4)' }}>支持推理档位</span>
              )}
            </div>
          ))
        )}
      </div>
    </KIT.Card>
  )
}

/** The deployment default-model picker: provider → model → reasoning effort. */
function DefaultModelPicker({ onSave, writable }: {
  onSave: (selection: ModelSelection) => Promise<void>
  writable: boolean
}): ReactNode {
  const { models } = useAppDeps()
  const s = models.state
  const current = s.defaultModel
  const [provider, setProvider] = useState<string>(current?.provider ?? '')
  const [model, setModel] = useState<string>(current?.model ?? '')
  const [effort, setEffort] = useState<string>(current?.reasoningEffort ?? '')
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (current === null) return
    setProvider(current.provider)
    setModel(current.model)
    setEffort(current.reasoningEffort ?? '')
  }, [current])
  const providerOptions = s.providers.map(p => ({ id: p.view.provider, label: p.view.displayName }))
  const providerRow = s.providers.find(p => p.view.provider === provider)
  const modelOptions = (providerRow?.models ?? []).map(m => ({ id: m.id, label: m.name }))
  const modelMeta = providerRow?.models.find(m => m.id === model)
  const effortOptions = (modelMeta?.reasoning?.efforts ?? []).map(e => ({ id: e.id, label: e.name }))
  // The selection is complete when a provider and a model are both chosen.
  const complete = provider !== '' && model !== ''
  return (
    <KIT.Card style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--db-text)' }}>默认模型</div>
      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--db-text-3)' }}>
        新会话默认使用的模型 provider 与档位；运行中的会话不受影响。
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <KIT.Select
          value={provider}
          options={providerOptions}
          form="field"
          disabled={!writable}
          placeholder="选择 provider"
          title="默认 provider"
          onChange={(p) => { setProvider(p); setDirty(true) }}
        />
        <KIT.Select
          value={model}
          options={modelOptions}
          form="field"
          disabled={!writable || provider === ''}
          placeholder="选择模型"
          title="默认模型"
          onChange={(m) => { setModel(m); setDirty(true) }}
        />
        {effortOptions.length > 0 && (
          <KIT.Select
            value={effort}
            options={effortOptions}
            form="field"
            disabled={!writable}
            placeholder="推理档位"
            title="默认推理档位"
            onChange={(e) => { setEffort(e); setDirty(true) }}
          />
        )}
        <KIT.Button
          kind="primary"
          disabled={!complete || !writable || s.busy || !dirty}
          onClick={() => {
            if (!complete) return
            void onSave({
              provider,
              model,
              ...effort === '' ? {} : { reasoningEffort: effort },
            })
          }}
        >
          {s.busy ? '保存中…' : '保存'}
        </KIT.Button>
      </div>
    </KIT.Card>
  )
}

/**
 * The Models settings page.
 */
export function ModelsPage(): ReactNode {
  const { models } = useAppDeps()
  useStore(models)
  useEffect(() => { void models.load() }, [])
  const s = models.state
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Intro>
        配置模型 provider 与凭据，并设定新会话默认使用的模型。API 密钥只写在本地凭据层，不落日志、不回显。
      </Intro>
      {s.status === 'idle' || s.status === 'loading' ? (
        <div style={{ fontSize: 12.5, color: 'var(--db-text-4)' }}>加载模型清单…</div>
      ) : s.status === 'error' ? (
        <Failure>{s.error ?? '模型数据读取失败'}</Failure>
      ) : (
        <>
          {s.defaultModel !== null && (
            <DefaultModelPicker onSave={models.saveDefault} writable={s.writable} />
          )}
          {s.providers.length === 0 ? (
            <KIT.EmptyState>这个部署没有可配置的模型 provider。</KIT.EmptyState>
          ) : (
            s.providers.map(row => (
              <ProviderCard key={row.view.provider} row={row} onSaveKey={models.saveCredential} />
            ))
          )}
        </>
      )}
      {s.status === 'ready' && s.saveError !== null && <Failure>{s.saveError}</Failure>}
    </div>
  )
}
