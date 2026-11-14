import { useEffect, useState, type ReactNode } from 'react'
import type { AppState } from '../../shared/types'
import { ApiSetup } from './ApiSetup'
import { Choice } from './Choice'
import { HotkeyEditor, prettyKeys } from './HotkeyEditor'
import { PromptPicker } from './PromptPicker'

const api = window.meetmind

/** Toolbar element a tour step points at (spotlighted in App). */
type Target = 'tabs' | 'ask' | 'listen' | 'settings' | 'window' | null

interface Step {
  target: Target
  render: () => ReactNode
}

/** First-run setup (A/B choices) followed by a tour of every button. Re-runnable from Settings. */
export function Tutorial({
  state,
  onTarget,
  onDone
}: {
  state: AppState
  onTarget: (t: Target) => void
  onDone: () => void
}) {
  const { settings } = state
  const [i, setI] = useState(0)
  const [name, setName] = useState(settings.myName)
  const keys = settings.hotkeys
  const apiMode = settings.answerSource === 'api'

  const steps: Step[] = [
    {
      target: null,
      render: () => (
        <>
          <h2>Welcome to MeetMind 👋</h2>
          <p>
            Your meeting copilot. MeetMind asks your system to <b>leave this window out of screen
            shares and recordings</b>, so people in your call shouldn't see it.
          </p>
          {state.protectionSupported ? (
            <p className="hint">
              It works with most meeting apps on Windows 10 (version 2004+) and Windows 11. On
              macOS, newer recorders may still capture it, and no system guarantees every
              recorder respects it. Test once with a real screen share before an important call.
            </p>
          ) : (
            <div className="warn">
              This system can't hide the window from screen share (it needs Windows 10 version
              2004 or newer, or macOS). Others may see MeetMind if you share your screen.
            </div>
          )}
          <p>Three quick choices, then a 30-second tour.</p>
        </>
      )
    },
    {
      target: null,
      render: () => (
        <>
          <h2>Where should answers come from?</h2>
          <Choice
            label="Answer source"
            value={settings.answerSource}
            onChange={(v) => api.setAnswerSource(v)}
            options={[
              {
                id: 'web',
                title: 'My ChatGPT / Claude / Gemini',
                badge: 'Free',
                desc: 'Log in once in the floating window and use your own account and plan. No key needed.'
              },
              {
                id: 'api',
                title: 'My own API key',
                desc: 'Answers appear right in MeetMind, faster and cleaner. You pay Claude, OpenAI or Gemini per use.'
              }
            ]}
          />
          {apiMode && <ApiSetup state={state} />}
        </>
      )
    },
    {
      target: null,
      render: () => (
        <>
          <h2>How should it listen?</h2>
          <Choice
            label="Listening mode"
            value={settings.listenMode}
            onChange={(v) => api.setListen({ listenMode: v })}
            options={[
              {
                id: 'push',
                title: 'Press to listen',
                desc: (
                  <>
                    Press <kbd>{prettyKeys(keys.listen)}</kbd> when someone asks something, press
                    again when they finish. You stay in control.
                  </>
                )
              },
              {
                id: 'live',
                title: 'Always listening',
                badge: 'Hands-free',
                desc: 'Live captions of the call. When a question comes up, the answer appears automatically.'
              }
            ]}
          />
          {settings.listenMode === 'live' && (
            <div className="live-options">
              <label className="row">
                <input
                  type="radio"
                  name="wiz-trigger"
                  checked={settings.liveTrigger === 'questions'}
                  onChange={() => api.setListen({ liveTrigger: 'questions' })}
                />
                <span>Answer every question</span>
              </label>
              <label className="row">
                <input
                  type="radio"
                  name="wiz-trigger"
                  checked={settings.liveTrigger === 'name'}
                  onChange={() => api.setListen({ liveTrigger: 'name' })}
                />
                <span>Only when someone says my name</span>
              </label>
              {settings.liveTrigger === 'name' && (
                <input
                  className="text-input"
                  value={name}
                  placeholder="Your name, as people say it"
                  onChange={(e) => {
                    setName(e.target.value)
                    api.setListen({ myName: e.target.value })
                  }}
                />
              )}
            </div>
          )}
          <p className="hint">Speech is turned into text on your PC, and it hears the meeting audio, so headphones are fine.</p>
        </>
      )
    },
    {
      target: null,
      render: () => (
        <>
          <h2>Your shortcuts</h2>
          <p>These work from any app, even while Zoom or Meet is in front. Click one to change it.</p>
          <HotkeyEditor state={state} compact />
          <p className="hint">All shortcuts, including tab switching, are in Settings.</p>
        </>
      )
    },
    {
      target: 'tabs',
      render: () =>
        apiMode ? (
          <>
            <h2>Your AI</h2>
            <p>Switch between Claude, OpenAI and Gemini here. Each one uses its own API key from Settings.</p>
          </>
        ) : (
          <>
            <h2>Your AIs</h2>
            <p>
              Switch between ChatGPT, Claude and Gemini. <b>Log in once</b> in each tab and the
              login is saved.
            </p>
            <kbd>{prettyKeys(keys.tab1)} / 2 / 3</kbd>
          </>
        )
    },
    {
      target: 'ask',
      render: () => (
        <>
          <h2>Ask about your screen</h2>
          <p>
            Screenshots the screen your mouse is on and asks the AI. Someone mentions a term you
            don't know? Press it and read the answer.
          </p>
          <kbd>{prettyKeys(keys.ask)}</kbd>
        </>
      )
    },
    {
      target: 'listen',
      render: () => (
        <>
          <h2>{settings.listenMode === 'live' ? 'Live listening' : 'Listen to the meeting'}</h2>
          <p>
            {settings.listenMode === 'live'
              ? 'Turns live captions on or off. While it is on, questions get answered by themselves.'
              : 'Press once to start and again to stop. The AI then gives you a reply you can say out loud.'}
          </p>
          <kbd>{prettyKeys(keys.listen)}</kbd>
        </>
      )
    },
    {
      target: 'settings',
      render: () => (
        <>
          <h2>Settings</h2>
          <p>Answer source, API keys, prompts, listening, shortcuts, opacity, and this setup again.</p>
        </>
      )
    },
    {
      target: 'window',
      render: () => (
        <>
          <h2>Shrink or hide</h2>
          <p>
            <b>−</b> shrinks MeetMind to just this bar, and <b>+</b> opens it again. It also opens
            by itself when an answer arrives. <b>×</b> hides it completely: bring it back with the
            shortcut or the <b>purple dot</b> in your system tray.
          </p>
          <kbd>{prettyKeys(keys.toggle)}</kbd>
        </>
      )
    },
    {
      target: null,
      render: () => (
        <>
          <h2>What should go with your screenshot?</h2>
          <p>Pick a style. You can change it any time in Settings.</p>
          <PromptPicker settings={settings} />
        </>
      )
    },
    {
      target: null,
      render: () => (
        <>
          <h2>You're all set 🎉</h2>
          {apiMode ? (
            state.apiKeySet[settings.apiProvider] ? (
              <p>Answers will appear right in this window.</p>
            ) : (
              <p>
                One thing left: <b>add your API key</b> in Settings (gear icon) before your meeting.
              </p>
            )
          ) : (
            <p>
              Next: <b>log in to your AI</b> in the tab that opens. If Google sign-in is refused,
              use email login on that site instead.
            </p>
          )}
          <p className="hint">
            Tip: test it before your meeting. Start a screen share in Zoom or Meet and check the
            window doesn't show up.
          </p>
        </>
      )
    }
  ]

  const total = steps.length
  const step = steps[i]

  useEffect(() => {
    onTarget(step.target)
  }, [i])

  const next = () => (i < total - 1 ? setI(i + 1) : onDone())
  const back = () => setI(Math.max(0, i - 1))

  return (
    <main className="tutorial">
      <div className="tutorial-body" key={i}>
        {step.render()}
      </div>
      <footer className="tutorial-nav">
        <div className="dots" aria-label={`Step ${i + 1} of ${total}`}>
          {steps.map((_, n) => (
            <span key={n} className={n === i ? 'on' : ''} />
          ))}
        </div>
        <div className="nav-buttons">
          {i === 0 ? (
            <button className="ghost" onClick={onDone}>Skip</button>
          ) : (
            <button className="ghost" onClick={back}>Back</button>
          )}
          <button className="primary" onClick={next}>
            {i === total - 1 ? 'Start' : 'Next'}
          </button>
        </div>
      </footer>
    </main>
  )
}
