import { useState } from 'react'
import type { Answer, AppState } from '../../shared/types'
import { prettyKeys } from './HotkeyEditor'

/** API mode: answers stream in here, newest on top. */
export function AnswersPanel({ answers, state }: { answers: Answer[]; state: AppState }) {
  const { settings } = state
  const hasKey = state.apiKeySet[settings.apiProvider]

  if (!answers.length) {
    return (
      <main className="answers empty">
        <div className="empty-card">
          <h2>Ready when you are</h2>
          {hasKey ? (
            <p>
              Press <kbd>{prettyKeys(settings.hotkeys.ask)}</kbd> to ask about your screen, or{' '}
              <kbd>{prettyKeys(settings.hotkeys.listen)}</kbd> to listen. Answers appear here.
            </p>
          ) : (
            <p>Add your API key in Settings (gear icon) to start getting answers.</p>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="answers">
      {answers.map((a) => (
        <article key={a.id} className={`answer ${a.error ? 'failed' : ''}`}>
          <header>
            <span className="answer-kind">{a.kind === 'screen' ? '📸' : '🎙️'}</span>
            <span className="answer-q" title={a.question}>{a.question}</span>
            <span className="answer-by">{a.provider}</span>
            {a.done && !a.error && <CopyButton text={a.text} />}
          </header>
          {a.error ? (
            <p className="error">{a.error}</p>
          ) : (
            <p className="answer-text">
              {a.text}
              {!a.done && <span className="caret" aria-hidden />}
            </p>
          )}
        </article>
      ))}
    </main>
  )
}

/** Text selection + Ctrl+C needs keyboard focus, which the window doesn't take in API mode. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="copy-btn"
      title="Copy answer"
      onClick={() => {
        window.meetmind.copyText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
