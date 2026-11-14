import { useState } from 'react'

const api = window.meetmind

/**
 * The WinRAR-style reminder: friendly, skippable, and it never blocks anything.
 * Shown at most every two weeks, and only when the user isn't recording or waiting on an answer.
 */
export function SupportCard({ onClose }: { onClose: () => void }) {
  const [opened, setOpened] = useState(false)

  return (
    <main className="support">
      <div className="support-card">
        <div className="support-cup" aria-hidden>☕</div>
        {opened ? (
          <>
            <h2>Thank you!! 💜</h2>
            <p>
              Ko-fi opened in your browser. Once you've chipped in, click <b>I already supported</b>{' '}
              and this card won't show again.
            </p>
          </>
        ) : (
          <>
            <h2>Enjoying MeetMind?</h2>
            <p>
              It's free and open source, and it stays that way. If it saved you in a meeting, a
              small tip helps keep it going.
            </p>
            <p className="hint">Everything keeps working whether you pay or not. No catch.</p>
          </>
        )}

        <div className="support-actions">
          {!opened && (
            <button
              className="primary"
              onClick={() => {
                api.supportAction('open')
                setOpened(true)
              }}
            >
              Support on Ko-fi ☕
            </button>
          )}
          <button className="ghost" onClick={onClose}>
            {opened ? 'Close' : 'Continue free'}
          </button>
        </div>
        <button
          className="link support-done"
          onClick={() => {
            api.supportAction('supported')
            onClose()
          }}
        >
          I already supported
        </button>
      </div>
    </main>
  )
}
