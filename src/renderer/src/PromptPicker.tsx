import { useEffect, useState } from 'react'
import { CUSTOM_PROMPT_EXAMPLE, PROMPT_PRESETS, type Settings } from '../../shared/types'

const api = window.meetmind

/** Choose what text goes with each screenshot. Used in the tutorial and in Settings. */
export function PromptPicker({ settings }: { settings: Settings }) {
  const [custom, setCustom] = useState(settings.customPrompt)
  const [fileError, setFileError] = useState('')

  // Pick up changes made elsewhere (e.g. the other picker instance) without fighting the caret.
  useEffect(() => {
    if (document.activeElement?.tagName !== 'TEXTAREA') setCustom(settings.customPrompt)
  }, [settings.customPrompt])

  const pick = async () => {
    setFileError((await api.pickContextFile()) ?? '')
  }

  return (
    <div className="prompt-picker">
      <div className="presets" role="radiogroup" aria-label="Screenshot prompt">
        {PROMPT_PRESETS.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={settings.promptMode === p.id}
            className={`preset ${settings.promptMode === p.id ? 'selected' : ''}`}
            onClick={() => api.setPromptMode(p.id)}
          >
            <span className="preset-label">{p.label}</span>
            <span className="preset-hint">{p.hint}</span>
          </button>
        ))}
      </div>

      {(settings.promptMode === 'short' || settings.promptMode === 'detailed') && (
        <blockquote className="preview">
          {PROMPT_PRESETS.find((p) => p.id === settings.promptMode)!.text}
        </blockquote>
      )}

      {settings.promptMode === 'none' && (
        <p className="hint">Only the screenshot is sent. Answers tend to be longer.</p>
      )}

      {settings.promptMode === 'custom' && (
        <>
          <textarea
            rows={4}
            value={custom}
            placeholder={CUSTOM_PROMPT_EXAMPLE}
            onChange={(e) => {
              setCustom(e.target.value)
              api.setCustomPrompt(e.target.value)
            }}
          />
          {!custom.trim() && (
            <button
              className="link"
              onClick={() => {
                setCustom(CUSTOM_PROMPT_EXAMPLE)
                api.setCustomPrompt(CUSTOM_PROMPT_EXAMPLE)
              }}
            >
              Use the example
            </button>
          )}
          <div className="context-row">
            {settings.contextFile ? (
              <span className="file-chip" title={settings.contextFile.path}>
                <FileIcon />
                <span className="file-name">{settings.contextFile.name}</span>
                <button aria-label="Remove context file" onClick={() => api.clearContextFile()}>
                  ×
                </button>
              </span>
            ) : (
              <button className="ghost" onClick={pick}>
                <FileIcon /> Add context file
              </button>
            )}
            <span className="hint">.md or .txt, sent with every screenshot. Edits apply right away.</span>
          </div>
          {fileError && <p className="error">{fileError}</p>}
        </>
      )}
    </div>
  )
}

const FileIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
)
