import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_AUDIO_PROMPT,
  LANGUAGES,
  PROVIDERS,
  WHISPER_MODELS,
  type AppState
} from '../../shared/types'
import { PromptPicker } from './PromptPicker'
import { Recorder } from './recorder'
import { Tutorial } from './Tutorial'

const api = window.meetmind
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Owns the audio recorder; the hotkey in main and the Listen button both toggle it. */
function useListen(state: AppState | null) {
  const recorder = useRef(new Recorder())
  const recording = useRef(false)
  const starting = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state
  const [seconds, setSeconds] = useState<number | null>(null)

  useEffect(() => {
    if (seconds === null) return
    const t = window.setInterval(() => setSeconds(recorder.current.seconds), 250)
    return () => window.clearInterval(t)
  }, [seconds === null])

  const toggle = useCallback(async () => {
    const s = stateRef.current
    if (!s || starting.current) return
    if (recording.current) {
      recording.current = false
      setSeconds(null)
      const audio = await recorder.current.stop()
      api.setListening(false)
      api.sendAudio(audio)
      return
    }
    if (s.busy) return
    starting.current = true
    try {
      await recorder.current.start({ system: s.settings.listenSystem, mic: s.settings.listenMic })
      recording.current = true
      setSeconds(0)
      api.setListening(true)
    } catch (err) {
      await recorder.current.stop()
      api.listenError((err as Error).message || String(err))
    } finally {
      starting.current = false
    }
  }, [])

  useEffect(() => api.onToggleListen(() => void toggle()), [toggle])
  return { seconds, toggle }
}

export function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [panel, setPanel] = useState(false)
  const [flash, setFlash] = useState('')
  const [tourAgain, setTourAgain] = useState(false)
  const [tourTarget, setTourTarget] = useState<string | null>(null)
  const [audioPrompt, setAudioPrompt] = useState('')
  const listen = useListen(state)
  const flashTimer = useRef<number | undefined>(undefined)
  const wasBusy = useRef(false)

  useEffect(() => {
    api.getState().then((s) => {
      setState(s)
      setAudioPrompt(s.settings.audioPrompt)
    })
    return api.onState((s) => {
      setState(s)
      const finished = wasBusy.current && !s.busy
      wasBusy.current = s.busy
      // Show the result of a capture briefly on the Ask button.
      if (finished) {
        setFlash(s.status)
        window.clearTimeout(flashTimer.current)
        flashTimer.current = window.setTimeout(() => setFlash(''), 3000)
      }
    })
  }, [])

  const togglePanel = (open: boolean) => {
    setPanel(open)
    api.setPanel(open)
  }

  if (!state) return null
  const { settings } = state
  const askLabel = state.busy ? state.status : flash || 'Ask'
  const recording = listen.seconds !== null
  const touring = !settings.onboarded || tourAgain
  /** Spotlight ring on the toolbar element the tutorial is explaining. */
  const spot = (name: string) => (touring && tourTarget === name ? ' spotlight' : '')

  const startTour = () => {
    setPanel(false)
    setTourAgain(true)
    api.setPanel(true)
  }
  const endTour = () => {
    setTourAgain(false)
    setTourTarget(null)
    api.finishOnboarding()
  }

  return (
    <div className={`app${touring ? ' touring' : ''}`}>
      <div className="grip" title="Drag to move">
        <span />
      </div>
      <header className="toolbar">
        <div className="brand" title="Drag to move">
          <span className="dot" />
        </div>
        <nav className={`tabs${spot('tabs')}`}>
          {PROVIDERS.map((p, i) => (
            <button
              key={p.id}
              className={`tab ${settings.active === p.id && !panel && !touring ? 'active' : ''}`}
              title={`${p.name}  (Ctrl+Shift+${i + 1})`}
              onClick={() => {
                if (panel) togglePanel(false)
                api.setProvider(p.id)
              }}
            >
              {p.name}
            </button>
          ))}
        </nav>
        <div className="drag-space" />
        <button
          className={`listen ${recording ? 'rec' : ''}${spot('listen')}`}
          disabled={state.busy && !recording}
          title={recording ? 'Stop and ask the AI  (Ctrl+Shift+L)' : 'Listen to the meeting  (Ctrl+Shift+L)'}
          onClick={() => void listen.toggle()}
        >
          {recording ? (
            <>
              <span className="rec-dot" />
              <span>{fmtTime(listen.seconds!)}</span>
            </>
          ) : (
            <MicIcon />
          )}
        </button>
        <button
          className={`ask ${state.busy ? 'busy' : ''}${spot('ask')}`}
          disabled={state.busy}
          title="Screenshot → ask the AI  (Ctrl+Shift+Space)"
          onClick={() => api.capture()}
        >
          <CameraIcon />
          <span className="ask-label">{askLabel}</span>
        </button>
        <button
          className={`icon ${panel ? 'on' : ''}${spot('settings')}`}
          title="Settings"
          onClick={() => togglePanel(!panel)}
        >
          <GearIcon />
        </button>
        <button
          className={`icon${spot('window')}`}
          title={state.collapsed ? 'Expand' : 'Shrink to this bar'}
          onClick={() => {
            if (!state.collapsed && panel) togglePanel(false)
            api.setCollapsed(!state.collapsed)
          }}
        >
          {state.collapsed ? <PlusIcon /> : <MinusIcon />}
        </button>
        <button
          className={`icon close${spot('window')}`}
          title="Hide to tray  (Ctrl+Shift+H brings it back)"
          onClick={() => api.hide()}
        >
          <CloseIcon />
        </button>
      </header>

      {touring && <Tutorial settings={settings} onTarget={setTourTarget} onDone={endTour} />}

      {panel && !touring && (
        <main className="panel">
          {!state.protectionSupported && (
            <div className="warn">
              This system can't hide the window from screen share. It needs Windows 10 version
              2004 or newer, or macOS. Others may see this window.
            </div>
          )}

          <section>
            <h3>Screenshot → AI</h3>
            <label className="row">
              <input
                type="checkbox"
                checked={settings.autoSend}
                onChange={(e) => api.setAutoSend(e.target.checked)}
              />
              <span>Send automatically after pasting</span>
            </label>
            <PromptPicker settings={settings} />
          </section>

          <section>
            <h3>Listen → AI</h3>
            <label className="row">
              <input
                type="checkbox"
                checked={settings.listenSystem}
                onChange={(e) => api.setListen({ listenSystem: e.target.checked })}
              />
              <span>Meeting audio (everyone in the call)</span>
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={settings.listenMic}
                onChange={(e) => api.setListen({ listenMic: e.target.checked })}
              />
              <span>My microphone</span>
            </label>
            <div className="split">
              <label className="field">
                <span>Speech model</span>
                <select
                  value={settings.whisperModel}
                  onChange={(e) => api.setListen({ whisperModel: e.target.value })}
                >
                  {WHISPER_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Language</span>
                <select
                  value={settings.language}
                  onChange={(e) => api.setListen({ language: e.target.value })}
                >
                  {LANGUAGES.map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Prompt ({'{transcript}'} = what was said)</span>
              <textarea
                rows={4}
                value={audioPrompt}
                onChange={(e) => {
                  setAudioPrompt(e.target.value)
                  api.setListen({ audioPrompt: e.target.value })
                }}
              />
            </label>
            <button
              className="link"
              onClick={() => {
                setAudioPrompt(DEFAULT_AUDIO_PROMPT)
                api.setListen({ audioPrompt: DEFAULT_AUDIO_PROMPT })
              }}
            >
              Reset prompt
            </button>
            <p className="hint">
              Speech is transcribed on your PC. The model downloads once, on first use.
            </p>
          </section>

          <section>
            <h3>Window</h3>
            <label className="field">
              <span>Opacity {Math.round(settings.opacity * 100)}%</span>
              <input
                type="range"
                min={0.3}
                max={1}
                step={0.05}
                value={settings.opacity}
                onChange={(e) => api.setOpacity(Number(e.target.value))}
              />
            </label>
            <div className="buttons">
              <button onClick={() => { togglePanel(false); api.back() }}>Back</button>
              <button onClick={() => { togglePanel(false); api.reload() }}>Reload tab</button>
              <button onClick={startTour}>Tutorial</button>
              <button className="danger" onClick={() => api.quit()}>Quit</button>
            </div>
          </section>

          <section>
            <h3>Hotkeys</h3>
            <dl className="keys">
              <dt>Ctrl+Shift+Space</dt><dd>Screenshot and ask</dd>
              <dt>Ctrl+Shift+L</dt><dd>Listen start / stop and ask</dd>
              <dt>Ctrl+Shift+H</dt><dd>Show / hide</dd>
              <dt>Ctrl+Shift+1 / 2 / 3</dt><dd>ChatGPT / Claude / Gemini</dd>
            </dl>
          </section>

          <p className="hint">
            Log in once in each tab and the login is saved. If Google sign-in is refused, use
            email login on that site instead.
          </p>
        </main>
      )}
    </div>
  )
}

const CameraIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
)
const GearIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)
const MicIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8" />
  </svg>
)
const PlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
    <path d="M5 12h14M12 5v14" />
  </svg>
)
const CloseIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
const MinusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
    <path d="M5 12h14" />
  </svg>
)
