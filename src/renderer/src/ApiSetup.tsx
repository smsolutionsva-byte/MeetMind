import { useState } from 'react'
import { API_PROVIDERS, type AppState } from '../../shared/types'

const api = window.meetmind

/** Pick an API provider, paste a key (stored encrypted), and optionally change the model. */
export function ApiSetup({ state }: { state: AppState }) {
  const { settings } = state
  const provider = API_PROVIDERS.find((p) => p.id === settings.apiProvider)!
  const hasKey = state.apiKeySet[provider.id]
  const [key, setKey] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [model, setModel] = useState(settings.apiModels[provider.id])
  const [editingModel, setEditingModel] = useState(false)

  const save = async () => {
    const err = await api.setApiKey(provider.id, key)
    setMsg(err ? { ok: false, text: err } : { ok: true, text: key.trim() ? 'Key saved, encrypted on this PC.' : 'Key removed.' })
    if (!err) setKey('')
  }

  return (
    <div className="api-setup">
      <div className="segmented" role="tablist" aria-label="API provider">
        {API_PROVIDERS.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={p.id === provider.id}
            className={p.id === provider.id ? 'on' : ''}
            onClick={() => {
              api.setApi({ provider: p.id })
              setModel(settings.apiModels[p.id])
              setMsg(null)
            }}
          >
            {p.name}
            {state.apiKeySet[p.id] && <span className="key-dot" title="Key saved" />}
          </button>
        ))}
      </div>

      <div className="key-row">
        <input
          type="password"
          value={key}
          placeholder={hasKey ? '•••••••• saved (paste to replace)' : `Paste your ${provider.name} API key`}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && key.trim() && void save()}
          spellCheck={false}
          autoComplete="off"
        />
        <button className="primary small" disabled={!key.trim()} onClick={save}>
          Save
        </button>
      </div>
      {msg && <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}
      <div className="api-links">
        <a href={provider.keyUrl} target="_blank" rel="noreferrer">Get a {provider.name} key ↗</a>
        {hasKey && (
          <button className="link" onClick={() => void api.setApiKey(provider.id, '').then(() => setMsg({ ok: true, text: 'Key removed.' }))}>
            Remove key
          </button>
        )}
      </div>

      <div className="model-row">
        <span className="hint">Model</span>
        {editingModel ? (
          <input
            value={model}
            autoFocus
            spellCheck={false}
            onChange={(e) => setModel(e.target.value)}
            onBlur={() => {
              api.setApi({ model })
              setEditingModel(false)
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <button className="model-chip" onClick={() => setEditingModel(true)} title="Change model">
            {settings.apiModels[provider.id]} ✎
          </button>
        )}
      </div>
      <p className="hint">You pay {provider.name} directly for what you use. Keys never leave this PC except to {provider.name}.</p>
    </div>
  )
}
