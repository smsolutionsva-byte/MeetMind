import {
  app,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  session,
  Tray,
  type NativeImage
} from 'electron'
import { streamAnswer } from './answer'
import { captureScreen, pasteIntoChat } from './capture'
import { getKey, keysSet, setKey } from './keys'
import { cleanTranscript, shouldAnswer, type TranscriptLine } from './live'
import { chromeUserAgent, Overlay, setupSession } from './overlay'
import { CONTEXT_EXTENSIONS, contextFileInfo, screenshotPrompt } from './prompt'
import { loadSettings, saveSettings } from './settings'
import { Transcriber } from './transcriber'
import {
  API_PROVIDERS,
  DEFAULT_HOTKEYS,
  LANGUAGES,
  PROMPT_PRESETS,
  PROVIDERS,
  WHISPER_MODELS,
  type Answer,
  type ApiProvider,
  type AppState,
  type HotkeyAction,
  type ProviderId,
  type Settings
} from '../shared/types'

// Must be set before any page loads so every request uses the clean Chrome UA.
app.userAgentFallback = chromeUserAgent()

// Testing aid: a separate profile (settings, logins, models) without touching the real one.
if (process.env.MEETMIND_USER_DATA) app.setPath('userData', process.env.MEETMIND_USER_DATA)

if (!app.requestSingleInstanceLock()) app.quit()

const settings = loadSettings()
let overlay: Overlay
let tray: Tray | undefined
let status = 'Ready'
/** A web-tab paste is in progress (the chat box can only take one at a time). */
let busy = false
let listening = false
let hotkeyConflicts: HotkeyAction[] = []

/** Windows 10 2004+ (build 19041) supports full exclusion from capture; older builds show a black box. */
function protectionSupported(): boolean {
  if (process.platform === 'darwin') return true
  if (process.platform !== 'win32') return false
  const build = Number(process.getSystemVersion().split('.')[2] ?? 0)
  return build >= 19041
}

function state(): AppState {
  return {
    settings,
    status,
    busy,
    listening,
    collapsed: overlay?.collapsed ?? false,
    protectionSupported: protectionSupported(),
    apiKeySet: keysSet(),
    hotkeyConflicts
  }
}

function send(channel: string, payload: unknown): void {
  if (overlay && !overlay.win.isDestroyed()) overlay.win.webContents.send(channel, payload)
}

function broadcast(): void {
  saveSettings(settings)
  send('state', state())
}

function setStatus(s: string): void {
  status = s
  broadcast()
}

const tabName = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)!.name
const apiName = (id: ApiProvider) => API_PROVIDERS.find((p) => p.id === id)!.name

/** Web tabs are hidden in API mode: answers show in MeetMind's own panel instead. */
function applyAnswerSource(): void {
  overlay.setWebHidden(settings.answerSource === 'api')
}

// ---- One way to ask: web tab (paste into ChatGPT/Claude/Gemini) or API (stream into panel) ----

let nextAnswerId = 1

async function askAI(req: { kind: 'screen' | 'audio'; question: string; text: string; image?: NativeImage }) {
  overlay.setCollapsed(false) // show the answer
  if (settings.answerSource === 'api') return askApi(req)

  if (busy) {
    setStatus('Still sending the last one…')
    return
  }
  busy = true
  try {
    const name = tabName(settings.active)
    setStatus(settings.autoSend ? `Sending to ${name}…` : `Pasting into ${name}…`)
    const result = await pasteIntoChat(overlay.active().webContents, {
      image: req.image,
      text: req.text,
      autoSend: settings.autoSend
    })
    setStatus(
      result === 'sent'
        ? `Sent to ${name}`
        : result === 'pasted'
          ? 'Pasted. Press Enter to send'
          : `Log in to ${name} first`
    )
  } finally {
    busy = false
    broadcast()
  }
}

async function askApi(req: { kind: 'screen' | 'audio'; question: string; text: string; image?: NativeImage }) {
  const provider = settings.apiProvider
  const answer: Answer = {
    id: nextAnswerId++,
    kind: req.kind,
    question: req.question,
    text: '',
    done: false,
    provider: apiName(provider)
  }
  const apiKey = getKey(provider)
  if (!apiKey) {
    send('answer', { ...answer, done: true, error: `Add your ${apiName(provider)} API key in Settings.` })
    return
  }
  send('answer', answer)
  setStatus(`Asking ${apiName(provider)}…`)
  try {
    await streamAnswer(
      { provider, model: settings.apiModels[provider], apiKey, text: req.text, image: req.image },
      (delta) => {
        answer.text += delta
        send('answer', answer)
      }
    )
    send('answer', { ...answer, done: true })
    setStatus(`Answered by ${apiName(provider)}`)
  } catch (err) {
    send('answer', { ...answer, done: true, error: (err as Error).message })
    setStatus('Answer failed')
  }
}

async function captureAndAsk(): Promise<void> {
  setStatus('Capturing screen…')
  try {
    const image = await captureScreen()
    if (!overlay.win.isVisible()) overlay.win.show()
    overlay.win.focus()
    await askAI({ kind: 'screen', question: 'Screenshot', text: await screenshotPrompt(settings), image })
  } catch (err) {
    console.error('[capture]', err)
    setStatus(`Capture failed: ${(err as Error).message}`)
  }
}

function audioPrompt(transcript: string): string {
  const template = settings.audioPrompt.includes('{transcript}')
    ? settings.audioPrompt
    : `${settings.audioPrompt}\n\n"{transcript}"`
  return template.replace('{transcript}', transcript)
}

// ---- Listening: push-to-talk clips, or always-on live segments ----

const transcriber = new Transcriber((pct) => {
  if (pct < 100) setStatus(`Downloading speech model ${pct}%`)
})

/** Hotkey/tray entry point: the toolbar page owns the recorder, so ask it to toggle. */
function toggleListen(): void {
  if (!overlay.win.isVisible()) overlay.win.showInactive()
  send('toggle-listen', null)
}

/** Push-to-talk: one recorded clip → transcript → ask. */
async function handleClip(audio: Float32Array): Promise<void> {
  if (audio.length < 16000 * 0.5) return setStatus('Nothing recorded')
  setStatus('Transcribing…')
  try {
    // Read the duration now: the buffer is handed over (detached) to the worker thread.
    const seconds = audio.length / 16000
    const transcript = cleanTranscript(
      await transcriber.transcribe(audio, settings.whisperModel, settings.language)
    )
    if (!transcript) return setStatus('No speech heard')
    if (process.env.MEETMIND_DRY_RUN) {
      // Testing aid: print the transcript instead of sending it to the AI.
      console.log(`[listen] dry run, ${seconds.toFixed(1)}s transcript: ${transcript}`)
      return setStatus('Dry run done')
    }
    await askAI({ kind: 'audio', question: transcript, text: audioPrompt(transcript) })
  } catch (err) {
    console.error('[listen]', err)
    setStatus(`Transcription failed: ${(err as Error).message}`)
  }
}

/** Live mode: speech segments arrive one by one; transcribe in order and answer questions. */
const live = {
  lines: [] as TranscriptLine[],
  queue: [] as Float32Array[],
  working: false,
  lastAskAt: 0
}

function onLiveSegment(audio: Float32Array): void {
  // If transcription falls behind, drop the oldest waiting segments rather than lag further.
  live.queue.push(audio)
  while (live.queue.length > 3) live.queue.shift()
  void drainLive()
}

async function drainLive(): Promise<void> {
  if (live.working) return
  live.working = true
  try {
    while (live.queue.length) {
      const audio = live.queue.shift()!
      let text = ''
      try {
        text = cleanTranscript(await transcriber.transcribe(audio, settings.whisperModel, settings.language))
      } catch (err) {
        setStatus(`Transcription failed: ${(err as Error).message}`)
        continue
      }
      if (!text) continue
      const line = { text, at: Date.now() }
      live.lines.push(line)
      if (live.lines.length > 30) live.lines.shift()
      send('transcript', line)
      if (process.env.MEETMIND_DRY_RUN) console.log(`[live] ${text}`)

      const now = Date.now()
      if (now - live.lastAskAt < 6000) continue // don't fire twice for one question
      if (!shouldAnswer(live.lines, settings.liveTrigger, settings.myName)) continue
      live.lastAskAt = now
      // Give the AI the last few lines so it knows what the question is about.
      const context = live.lines.slice(-4).map((l) => `- ${l.text}`).join('\n')
      if (process.env.MEETMIND_DRY_RUN) {
        console.log(`[live] would answer: ${text}`)
        continue
      }
      void askAI({ kind: 'audio', question: text, text: audioPrompt(`Recent lines (newest last):\n${context}`) })
    }
  } finally {
    live.working = false
  }
}

/**
 * The toolbar's getDisplayMedia() call is answered here with Windows loopback audio
 * (everything playing on the PC, i.e. the meeting). The video track is dropped by the page.
 */
function setupAudioCapture(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const [screenSource] = await desktopCapturer.getSources({ types: ['screen'] })
        callback(
          process.platform === 'win32'
            ? { video: screenSource, audio: 'loopback' }
            : { video: screenSource }
        )
      } catch {
        callback({})
      }
    },
    { useSystemPicker: false }
  )
}

// ---- Hotkeys (customisable) ----

const hotkeyActions: Record<HotkeyAction, () => void> = {
  ask: () => void captureAndAsk(),
  listen: () => toggleListen(),
  toggle: () => overlay.toggle(),
  tab1: () => overlay.show('chatgpt'),
  tab2: () => overlay.show('claude'),
  tab3: () => overlay.show('gemini')
}

function registerHotkeys(): void {
  globalShortcut.unregisterAll()
  hotkeyConflicts = []
  for (const action of Object.keys(hotkeyActions) as HotkeyAction[]) {
    const accel = settings.hotkeys[action]
    if (!accel) continue
    try {
      if (!globalShortcut.register(accel, hotkeyActions[action])) hotkeyConflicts.push(action)
    } catch {
      hotkeyConflicts.push(action) // malformed accelerator
    }
  }
  if (hotkeyConflicts.length) console.warn('[shortcut] taken by another app:', hotkeyConflicts.join(', '))
}

/** 16×16 purple dot drawn in code, so the tray needs no image asset. */
function trayIcon(): NativeImage {
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5)
      const i = (y * size + x) * 4
      const a = d < 6.5 ? 255 : d < 7.5 ? Math.round((7.5 - d) * 255) : 0
      buf[i] = 0xf6 // B
      buf[i + 1] = 0x5c // G
      buf[i + 2] = 0x8b // R
      buf[i + 3] = a
    }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

function setupTray(): void {
  tray = new Tray(trayIcon())
  tray.setToolTip('MeetMind')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show / hide', click: () => overlay.toggle() },
      { label: 'Screenshot and ask', click: () => void captureAndAsk() },
      { label: 'Listen start / stop', click: () => toggleListen() },
      { type: 'separator' },
      { label: 'Quit MeetMind', click: () => app.quit() }
    ])
  )
  tray.on('click', () => overlay.toggle())
}

function setupIpc(): void {
  ipcMain.handle('get-state', () => state())
  ipcMain.on('set-provider', (_e, id: ProviderId) => {
    if (PROVIDERS.some((p) => p.id === id)) overlay.show(id)
  })
  ipcMain.on('capture', () => void captureAndAsk())
  ipcMain.on('set-auto-send', (_e, v: boolean) => {
    settings.autoSend = !!v
    broadcast()
  })
  ipcMain.on('set-prompt-mode', (_e, mode: string) => {
    const preset = PROMPT_PRESETS.find((p) => p.id === mode)
    if (preset) settings.promptMode = preset.id
    broadcast()
  })
  ipcMain.on('set-custom-prompt', (_e, v: string) => {
    settings.customPrompt = String(v).slice(0, 4000)
    broadcast()
  })
  ipcMain.handle('pick-context-file', async () => {
    const res = await dialog.showOpenDialog(overlay.win, {
      title: 'Choose a context file',
      properties: ['openFile'],
      filters: [{ name: 'Text / Markdown', extensions: CONTEXT_EXTENSIONS }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    try {
      settings.contextFile = await contextFileInfo(res.filePaths[0])
      broadcast()
      return null
    } catch (err) {
      return (err as Error).message
    }
  })
  ipcMain.on('clear-context-file', () => {
    settings.contextFile = undefined
    broadcast()
  })
  ipcMain.on('finish-onboarding', () => {
    settings.onboarded = true
    overlay.setPanel(false)
    broadcast()
  })
  ipcMain.on('set-opacity', (_e, v: number) => {
    settings.opacity = Math.min(1, Math.max(0.3, Number(v) || 1))
    overlay.win.setOpacity(settings.opacity)
    broadcast()
  })
  ipcMain.on('reload', () => overlay.active().webContents.reload())
  ipcMain.on('back', () => {
    const nav = overlay.active().webContents.navigationHistory
    if (nav.canGoBack()) nav.goBack()
  })
  ipcMain.on('panel', (_e, open: boolean) => overlay.setPanel(!!open))
  ipcMain.on('collapse', (_e, collapse: boolean) => {
    overlay.setCollapsed(!!collapse)
    broadcast()
  })

  // Listening
  ipcMain.on('listening', (_e, on: boolean) => {
    listening = !!on
    const isLive = listening && settings.listenMode === 'live'
    overlay.setTranscriptBar(isLive)
    if (listening) {
      transcriber.preload(settings.whisperModel) // warm up the model while recording
      if (isLive) live.lines = []
      setStatus(isLive ? 'Live listening…' : 'Listening…')
    } else setStatus('Ready')
  })
  ipcMain.on('listen-error', (_e, message: string) => {
    listening = false
    overlay.setTranscriptBar(false)
    console.error('[listen] start failed:', message)
    setStatus(`Can't listen: ${String(message).slice(0, 120)}`)
  })
  ipcMain.on('audio', (_e, audio: Float32Array) => {
    if (audio instanceof Float32Array) void handleClip(audio)
  })
  ipcMain.on('live-segment', (_e, audio: Float32Array) => {
    if (audio instanceof Float32Array && listening) onLiveSegment(audio)
  })
  ipcMain.on('set-listen', (_e, patch: Partial<Settings>) => {
    if (typeof patch.listenSystem === 'boolean') settings.listenSystem = patch.listenSystem
    if (typeof patch.listenMic === 'boolean') settings.listenMic = patch.listenMic
    if (WHISPER_MODELS.some((m) => m.id === patch.whisperModel)) settings.whisperModel = patch.whisperModel!
    if (LANGUAGES.some(([code]) => code === patch.language)) settings.language = patch.language!
    if (typeof patch.audioPrompt === 'string') settings.audioPrompt = patch.audioPrompt.slice(0, 2000)
    if (patch.listenMode === 'push' || patch.listenMode === 'live') settings.listenMode = patch.listenMode
    if (patch.liveTrigger === 'questions' || patch.liveTrigger === 'name') settings.liveTrigger = patch.liveTrigger
    if (typeof patch.myName === 'string') settings.myName = patch.myName.slice(0, 60)
    broadcast()
  })

  // Answer source and API keys
  ipcMain.on('set-answer-source', (_e, v: string) => {
    settings.answerSource = v === 'api' ? 'api' : 'web'
    applyAnswerSource()
    broadcast()
  })
  ipcMain.on('set-api', (_e, patch: { provider?: string; model?: string }) => {
    const p = API_PROVIDERS.find((x) => x.id === patch.provider)
    if (p) settings.apiProvider = p.id
    if (typeof patch.model === 'string')
      settings.apiModels[settings.apiProvider] = patch.model.trim().slice(0, 100) ||
        API_PROVIDERS.find((x) => x.id === settings.apiProvider)!.defaultModel
    broadcast()
  })
  ipcMain.handle('set-api-key', (_e, provider: string, key: string) => {
    const p = API_PROVIDERS.find((x) => x.id === provider)
    if (!p) return 'Unknown provider'
    try {
      setKey(p.id, String(key))
      broadcast()
      return null
    } catch (err) {
      return (err as Error).message
    }
  })

  // Hotkeys
  ipcMain.handle('set-hotkey', (_e, action: HotkeyAction, accel: string) => {
    if (!(action in hotkeyActions)) return 'Unknown action'
    const taken = (Object.keys(settings.hotkeys) as HotkeyAction[]).find(
      (a) => a !== action && accel && settings.hotkeys[a] === accel
    )
    if (taken) return 'Already used by another MeetMind shortcut'
    settings.hotkeys[action] = accel
    registerHotkeys()
    broadcast()
    return hotkeyConflicts.includes(action) ? 'Another app already uses this shortcut' : null
  })
  ipcMain.on('reset-hotkeys', () => {
    settings.hotkeys = { ...DEFAULT_HOTKEYS }
    registerHotkeys()
    broadcast()
  })
  // While the user is recording a new shortcut, stop the old ones from firing.
  ipcMain.on('pause-hotkeys', (_e, paused: boolean) => {
    if (paused) globalShortcut.unregisterAll()
    else registerHotkeys()
  })

  ipcMain.on('hide', () => overlay.win.hide())
  ipcMain.on('quit', () => app.quit())
}

app.whenReady().then(() => {
  setupSession()
  setupAudioCapture()
  setupIpc()
  overlay = new Overlay(settings, broadcast)
  applyAnswerSource()
  setupTray()
  registerHotkeys()
})

app.on('second-instance', () => {
  if (overlay) {
    overlay.win.show()
    overlay.win.focus()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  transcriber.dispose()
})
app.on('window-all-closed', () => app.quit())
