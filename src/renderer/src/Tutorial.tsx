import { useEffect, useState, type ReactNode } from 'react'
import type { Settings } from '../../shared/types'
import { PromptPicker } from './PromptPicker'

/** data-tour value of the toolbar element each step points at. */
type Target = 'tabs' | 'ask' | 'listen' | 'settings' | 'window' | null

interface Step {
  target: Target
  title: string
  body: ReactNode
  keys?: string
}

const STEPS: Step[] = [
  {
    target: null,
    title: 'Welcome to MeetMind 👋',
    body: (
      <>
        Your invisible meeting copilot. This window is <b>hidden from screen share and recordings</b>,
        so people in your call can't see it. Here's a 30-second tour.
      </>
    )
  },
  {
    target: 'tabs',
    title: 'Your AIs',
    body: (
      <>
        Switch between ChatGPT, Claude and Gemini. <b>Log in once</b> in each tab and the login is
        saved, so you use your own account and your own subscription.
      </>
    ),
    keys: 'Ctrl+Shift+1 / 2 / 3'
  },
  {
    target: 'ask',
    title: 'Ask about your screen',
    body: (
      <>
        Takes a screenshot of the screen your mouse is on and sends it to the AI with your prompt.
        Someone mentions a term you don't know? Press it and read the answer.
      </>
    ),
    keys: 'Ctrl+Shift+Space'
  },
  {
    target: 'listen',
    title: 'Listen to the meeting',
    body: (
      <>
        Press once to start and again to stop. It hears <b>the meeting audio</b>, not just your mic,
        so it works with headphones. Speech is turned into text on your PC, then the AI gives you a
        reply you can say out loud.
      </>
    ),
    keys: 'Ctrl+Shift+L'
  },
  {
    target: 'settings',
    title: 'Settings',
    body: <>Prompts, audio options, speech language, opacity, and this tour again.</>
  },
  {
    target: 'window',
    title: 'Shrink or hide',
    body: (
      <>
        <b>−</b> shrinks MeetMind to just this bar, and <b>+</b> opens it again. It also opens by
        itself when an answer arrives. <b>×</b> hides it completely: bring it back with the hotkey
        or the <b>purple dot</b> in your system tray.
      </>
    ),
    keys: 'Ctrl+Shift+H'
  }
]

export function Tutorial({
  settings,
  onTarget,
  onDone
}: {
  settings: Settings
  onTarget: (t: Target) => void
  onDone: () => void
}) {
  // Tour steps, then the prompt choice, then the final screen.
  const total = STEPS.length + 2
  const [i, setI] = useState(0)
  const step = STEPS[i]

  useEffect(() => {
    onTarget(step?.target ?? null)
  }, [i])

  const next = () => (i < total - 1 ? setI(i + 1) : onDone())
  const back = () => setI(Math.max(0, i - 1))

  let content: ReactNode
  if (step) {
    content = (
      <>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        {step.keys && <kbd>{step.keys}</kbd>}
      </>
    )
  } else if (i === STEPS.length) {
    content = (
      <>
        <h2>What should go with your screenshot?</h2>
        <p>Pick a style. You can change it any time in Settings.</p>
        <PromptPicker settings={settings} />
      </>
    )
  } else {
    content = (
      <>
        <h2>You're all set 🎉</h2>
        <p>
          Next: <b>log in to your AI</b> in the tab that opens. If Google sign-in is refused, use
          email login on that site instead.
        </p>
        <p className="hint">
          Tip: test it before your meeting. Start a screen share in Zoom or Meet and check the
          window doesn't show up.
        </p>
      </>
    )
  }

  return (
    <main className="tutorial">
      <div className="tutorial-body">{content}</div>
      <footer className="tutorial-nav">
        <div className="dots" aria-label={`Step ${i + 1} of ${total}`}>
          {Array.from({ length: total }, (_, n) => (
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
