import { useCallback, useEffect, useRef, useState } from 'react'
import {
  API_PROVIDERS,
  DEFAULT_AUDIO_PROMPT,
  LANGUAGES,
  PROVIDERS,
  WHISPER_MODELS,
  type Answer,
  type AppState,
  type ProviderId
} from '../../shared/types'
import { AnswersPanel } from './AnswersPanel'
import { GoogleNotice } from './GoogleNotice'
import { ApiSetup } from './ApiSetup'
import { Choice } from './Choice'
import { HotkeyEditor, prettyKeys } from './HotkeyEditor'
import { PromptPicker } from './PromptPicker'
import { Recorder } from './recorder'
import { SupportCard } from './SupportCard'
import { Tutorial } from './Tutorial'

const api = window.meetmind
/** Keep the newest words of a long caption visible. */
const tail = (text: string, max = 90) => (text.length > max ? '…' + text.slice(-max) : text)
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Owns the audio recorder; the hotkey in main and the Listen button both toggle it. */
function useListen(state: AppState | null) {
  const recorder = useRef(new Recorder())
  const recording = useRef<'push' | 'live' | null>(null)
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
      const mode = recording.current
      recording.current = null
      setSeconds(null)
      const audio = await recorder.current.stop() // live mode flushes its last sentence here
      api.setListening(false)
      if (mode === 'push') api.sendAudio(audio)
      return
    }
    starting.current = true
    const mode = s.settings.listenMode
    try {
      await recorder.current.start({
        system: s.settings.listenSystem,
        mic: s.settings.listenMic,
        onSegment: mode === 'live' ? (seg) => api.sendLiveSegment(seg) : undefined
      })
      recording.current = mode
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

/** Answers (API mode) and live captions streamed from the main process. */
function useStreams() {
  const [answers, setAnswers] = useState<Answer[]>([])
  const [captions, setCaptions] = useState<string[]>([])
  useEffect(() => {
    const offAnswer = api.onAnswer((a) =>
      setAnswers((list) => {
        const i = list.findIndex((x) => x.id === a.id)
        if (i === -1) return [a, ...list].slice(0, 20)
        const next = list.slice()
        next[i] = a
        return next
      })
    )
    const offCaption = api.onTranscript((line) => setCaptions((c) => [...c, line.text].slice(-6)))
    return () => {
      offAnswer()
      offCaption()
    }
  }, [])
  return { answers, captions, clearCaptions: () => setCaptions([]) }
}

export function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [panel, setPanel] = useState(false)
  const [flash, setFlash] = useState('')
  const [tourAgain, setTourAgain] = useState(false)
  const [tourTarget, setTourTarget] = useState<string | null>(null)
  const [audioPrompt, setAudioPrompt] = useState('')
  const [myName, setMyName] = useState('')
  const [supportOpen, setSupportOpen] = useState(false)
  const [googleNotice, setGoogleNotice] = useState<ProviderId | null>(null)
  const listen = useListen(state)
  const streams = useStreams()
  const flashTimer = useRef<number | undefined>(undefined)
  const wasBusy = useRef(false)

  useEffect(() => {
    api.getState().then((s) => {
      setState(s)
      setAudioPrompt(s.settings.audioPrompt)
      setMyName(s.settings.myName)
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

  const recording = listen.seconds !== null

  // The main process decides when the reminder is due; skip it if the user is mid-task here.
  const canShowSupport = useRef(false)
  canShowSupport.current = !!state && state.settings.onboarded && !recording && !panel && !state.busy
  useEffect(
    () =>
      api.onShowSupport(() => {
        if (!canShowSupport.current) return
        setSupportOpen(true)
        api.setPanel(true) // hide the AI tab so the card has the window
      }),
    []
  )
  // A tab tried Google sign-in (blocked by Google inside apps): explain instead of Google's error.
  useEffect(
    () =>
      api.onGoogleSignIn((provider) => {
        setSupportOpen(false)
        setPanel(false)
        setGoogleNotice(provider)
        api.setPanel(true) // hide the AI tab so the notice has the window
      }),
    []
  )
  // Meeting notes pasted something into the AI tab: get Settings and cards out of the way.
  useEffect(
    () =>
      api.onResetView(() => {
        setPanel(false)
        setSupportOpen(false)
        setGoogleNotice(null)
        api.setPanel(false)
      }),
    []
  )

  const closeGoogleNotice = () => {
    setGoogleNotice(null)
    api.setPanel(false)
  }

  const closeSupport = () => {
    setSupportOpen(false)
    api.setPanel(false)
  }

  useEffect(() => {
    if (recording) streams.clearCaptions()
  }, [recording])

  const togglePanel = (open: boolean) => {
    setPanel(open)
    api.setPanel(open)
  }

  if (!state) return null
  const { settings } = state
  const apiMode = settings.answerSource === 'api'
  const askLabel = state.busy ? state.status : flash || 'Ask'
  const liveOn = recording && settings.listenMode === 'live'
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
          {apiMode
            ? API_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  className={`tab ${settings.apiProvider === p.id && !panel && !touring ? 'active' : ''}`}
                  title={`Answer with the ${p.name} API`}
                  onClick={() => {
                    if (panel) togglePanel(false)
                    api.setApi({ provider: p.id })
                  }}
                >
                  {p.name}
                </button>
              ))
            : PROVIDERS.map((p, i) => (
                <button
                  key={p.id}
                  className={`tab ${settings.active === p.id && !panel && !touring ? 'active' : ''}`}
                  title={`${p.name}  (${prettyKeys(settings.hotkeys[`tab${i + 1}` as 'tab1'])})`}
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
          className={`listen ${recording ? 'rec' : ''} ${liveOn ? 'live' : ''}${spot('listen')}`}
          title={`${recording ? 'Stop listening' : settings.listenMode === 'live' ? 'Start live listening' : 'Listen to the meeting'}  (${prettyKeys(settings.hotkeys.listen)})`}
          onClick={() => void listen.toggle()}
        >
          {recording ? (
            <>
              <span className="rec-dot" />
              {/* Live mode: the captions strip already says LIVE, keep the button small. */}
              {!liveOn && <span>{fmtTime(listen.seconds!)}</span>}
            </>
          ) : (
            <MicIcon />
          )}
        </button>
        <button
          className={`ask ${state.busy ? 'busy' : ''}${spot('ask')}`}
          disabled={state.busy}
          title={`Screenshot → ask the AI  (${prettyKeys(settings.hotkeys.ask)})`}
          onClick={() => api.capture()}
        >
          <CameraIcon />
          <span className="ask-label">{askLabel}</span>
        </button>
        <button className="icon" title="Meeting notes: history, summaries, questions" onClick={() => api.openNotes()}>
          <NotesIcon />
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
          title={`Hide to tray  (${prettyKeys(settings.hotkeys.toggle)} brings it back)`}
          onClick={() => api.hide()}
        >
          <CloseIcon />
        </button>
      </header>

      {liveOn && (
        <div className="captions" aria-live="polite">
          <span className="live-pill">LIVE</span>
          <span className="caption-text">
            {streams.captions.length ? tail(streams.captions[streams.captions.length - 1]) : 'Listening for speech…'}
          </span>
        </div>
      )}

      {touring && <Tutorial state={state} onTarget={setTourTarget} onDone={endTour} />}

      {googleNotice && !touring && !panel && (
        <GoogleNotice
          provider={googleNotice}
          onClose={closeGoogleNotice}
          onOpenSettings={() => {
            setGoogleNotice(null)
            setPanel(true) // the AI tab stays hidden: Settings uses the window now
          }}
          onGeminiKey={() => {
            setGoogleNotice(null)
            api.setAnswerSource('api')
            api.setApi({ provider: 'gemini' })
            setPanel(true)
          }}
          onSwitchTab={(id) => {
            closeGoogleNotice()
            api.setProvider(id)
          }}
        />
      )}

      {supportOpen && !googleNotice && !touring && !panel && <SupportCard onClose={closeSupport} />}

      {!touring && !panel && !supportOpen && !googleNotice && apiMode && <AnswersPanel answers={streams.answers} state={state} />}

      {panel && !touring && (
        <main className="panel">
          {!state.protectionSupported && (
            <div className="warn">
              This system can't hide the window from screen share. It needs Windows 10 version
              2004 or newer, or macOS. Others may see this window.
            </div>
          )}

          <section>
            <h3>Answers come from</h3>
            <Choice
              label="Answer source"
              value={settings.answerSource}
              onChange={(v) => api.setAnswerSource(v)}
              options={[
                { id: 'web', title: 'My ChatGPT / Claude / Gemini', desc: 'Your logged-in accounts in the floating window. No key needed.' },
                { id: 'api', title: 'My own API key', desc: 'Faster, answers right here. You pay the provider per use.' }
              ]}
            />
            {apiMode && <ApiSetup state={state} />}
          </section>

          <section>
            <h3>Screenshot → AI</h3>
            {!apiMode && (
              <label className="row">
                <input
                  type="checkbox"
                  checked={settings.autoSend}
                  onChange={(e) => api.setAutoSend(e.target.checked)}
                />
                <span>Send automatically after pasting</span>
              </label>
            )}
            <PromptPicker settings={settings} />
          </section>

          <section>
            <h3>Listening</h3>
            <Choice
              label="Listening mode"
              value={settings.listenMode}
              onChange={(v) => api.setListen({ listenMode: v })}
              options={[
                { id: 'push', title: 'Press to listen', desc: 'Press once to start, again to stop and ask.' },
                { id: 'live', title: 'Always listening', desc: 'Live captions; questions get answered automatically.' }
              ]}
            />
            {settings.listenMode === 'live' && (
              <div className="live-options">
                <label className="row">
                  <input
                    type="radio"
                    name="trigger"
                    checked={settings.liveTrigger === 'questions'}
                    onChange={() => api.setListen({ liveTrigger: 'questions' })}
                  />
                  <span>Answer every question</span>
                </label>
                <label className="row">
                  <input
                    type="radio"
                    name="trigger"
                    checked={settings.liveTrigger === 'name'}
                    onChange={() => api.setListen({ liveTrigger: 'name' })}
                  />
                  <span>Only when someone says my name</span>
                </label>
                {settings.liveTrigger === 'name' && (
                  <input
                    className="text-input"
                    value={myName}
                    placeholder="Your name, as people say it"
                    onChange={(e) => {
                      setMyName(e.target.value)
                      api.setListen({ myName: e.target.value })
                    }}
                  />
                )}
              </div>
            )}
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
            <h3>Meeting history</h3>
            <label className="row">
              <input
                type="checkbox"
                checked={settings.saveHistory}
                onChange={(e) => api.setSaveHistory(e.target.checked)}
              />
              <span>Save meeting transcripts on this PC</span>
            </label>
            <button className="ghost solid" onClick={() => api.openNotes()}>
              <NotesIcon /> Open meeting notes
            </button>
            <p className="hint">
              What MeetMind hears (and API answers) is kept here so you can summarize it or ask about it later.
              Nothing is uploaded unless you ask the AI about a meeting.
            </p>
          </section>

          <section>
            <h3>Shortcuts</h3>
            <HotkeyEditor state={state} />
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
              {!apiMode && <button onClick={() => { togglePanel(false); api.back() }}>Back</button>}
              {!apiMode && <button onClick={() => { togglePanel(false); api.reload() }}>Reload tab</button>}
              <button onClick={startTour}>Setup &amp; tour</button>
              <button onClick={() => api.supportAction('open')}>Support ☕</button>
              <button className="danger" onClick={() => api.quit()}>Quit</button>
            </div>
          </section>

          {!apiMode && (
            <p className="hint">
              Log in once in each tab and the login is saved. If Google sign-in is refused, use
              email login on that site instead.
            </p>
          )}
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

function NotesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  )
}
