import { useState } from 'react'
import { PROVIDERS, type ProviderId } from '../../shared/types'

const api = window.meetmind

/**
 * Shown instead of Google's "This browser or app may not be secure" page. Google blocks its
 * sign-in inside every app that embeds a browser, so explain that plainly and offer what works.
 */
export function GoogleNotice({
  provider,
  onClose,
  onOpenSettings,
  onGeminiKey,
  onSwitchTab
}: {
  provider: ProviderId
  onClose: () => void
  onOpenSettings: () => void
  onGeminiKey: () => void
  onSwitchTab: (id: ProviderId) => void
}) {
  const [retry, setRetry] = useState(false)
  const name = PROVIDERS.find((p) => p.id === provider)!.name

  const tryAnyway = async () => {
    const reopened = await api.tryGoogleSignIn()
    if (reopened) onClose()
    else setRetry(true)
  }

  if (retry)
    return (
      <main className="gnotice">
        <div className="gnotice-card">
          <div className="gnotice-icon" aria-hidden>
            <GoogleBadge />
          </div>
          <h2>Okay, give Google a try</h2>
          <p className="gnotice-lead">
            Click <b>Continue with Google</b> again within 2 minutes. If Google says the browser
            isn't secure, use email sign-in instead.
          </p>
          <div className="gnotice-actions">
            <button className="primary" onClick={onClose}>
              Got it
            </button>
          </div>
        </div>
      </main>
    )

  return (
    <main className="gnotice">
      <div className="gnotice-card">
        <div className="gnotice-icon" aria-hidden>
          {provider === 'gemini' ? <GoogleBadge /> : <MailIcon />}
        </div>

        {provider === 'gemini' ? (
          <>
            <h2>Gemini needs Google sign-in</h2>
            <p className="gnotice-lead">
              Google doesn't allow its sign-in inside desktop apps (every app, not only MeetMind),
              and Gemini has no email option. Two ways that work:
            </p>
            <div className="gnotice-options">
              <button className="gnotice-option" onClick={onGeminiKey}>
                <span className="gnotice-option-title">Use a Gemini API key</span>
                <span className="gnotice-option-desc">
                  Answers right here in MeetMind. Keys are free to create in Google AI Studio.
                </span>
                <span className="gnotice-option-go">Set up key →</span>
              </button>
              <button className="gnotice-option" onClick={() => onSwitchTab('chatgpt')}>
                <span className="gnotice-option-title">Use ChatGPT or Claude</span>
                <span className="gnotice-option-desc">
                  Both let you sign in with your email, and ChatGPT works as a guest too.
                </span>
                <span className="gnotice-option-go">Open ChatGPT →</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Sign in with your email instead</h2>
            <p className="gnotice-lead">
              Google doesn't allow its sign-in button inside desktop apps. That's every app, not only
              MeetMind. Your {name} account still works:
            </p>
            <ol className="gnotice-steps">
              <li>
                <span>
                  Type your email in the <b>email</b> box, not the Google button
                </span>
                <div className="gnotice-mock" aria-hidden>
                  <span className="gnotice-mock-input">
                    <MailIcon small /> you@gmail.com
                  </span>
                  <span className="gnotice-mock-btn">Continue</span>
                </div>
              </li>
              <li>
                <span>
                  {provider === 'claude'
                    ? 'Claude emails you a sign-in code. Open your inbox in your normal browser to get it.'
                    : 'Follow what ChatGPT asks next: a code from your inbox, or your password.'}
                </span>
              </li>
              <li>
                <span>You're in. MeetMind remembers the login for next time.</span>
              </li>
            </ol>
            <p className="gnotice-tip">
              Made your account with Google? Try the same Gmail address.
              {provider === 'chatgpt' && ' Or skip logging in: ChatGPT answers a few questions as a guest.'}
            </p>
          </>
        )}

        <div className="gnotice-actions">
          {provider !== 'gemini' && (
            <button className="primary" onClick={onClose}>
              Got it
            </button>
          )}
          <button className="ghost" onClick={provider === 'gemini' ? onClose : onOpenSettings}>
            {provider === 'gemini' ? 'Back' : 'Use an API key instead'}
          </button>
        </div>
        <button className="link gnotice-try" onClick={() => void tryAnyway()}>
          Try Google sign-in anyway
        </button>
      </div>
    </main>
  )
}

function MailIcon({ small }: { small?: boolean }) {
  const s = small ? 13 : 28
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  )
}

/** A neutral "G" in a circle with a small lock, standing for Google sign-in. */
function GoogleBadge() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 9.5A8 8 0 1 0 20 13h-7" />
      <rect x="15.5" y="15.5" width="7" height="6" rx="1.5" fill="var(--bg-2)" />
      <path d="M17 15.5v-1a2 2 0 0 1 4 0v1" />
    </svg>
  )
}
