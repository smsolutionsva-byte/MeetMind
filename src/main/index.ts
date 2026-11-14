import { app, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, session, Tray } from 'electron'
import { captureScreen, pasteIntoChat } from './capture'
import { chromeUserAgent, Overlay, setupSession } from './overlay'
import { CONTEXT_EXTENSIONS, contextFileInfo, screenshotPrompt } from './prompt'
import { loadSettings, saveSettings } from './settings'
import { Transcriber } from './transcriber'
import {
  LANGUAGES,
  PROMPT_PRESETS,
  PROVIDERS,
  WHISPER_MODELS,
  type AppState,
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
let busy = false

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
    protectionSupported: protectionSupported()
  }
}

function broadcast(): void {
  saveSettings(settings)
  if (overlay && !overlay.win.isDestroyed()) overlay.win.webContents.send('state', state())
}

function setStatus(s: string): void {
  status = s
  broadcast()
}

const nameOf = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)!.name

async function captureAndAsk(): Promise<void> {
  if (busy) return
  busy = true
  setStatus('Capturing screen…')
  try {
    const image = await captureScreen()
    if (!overlay.win.isVisible()) overlay.win.show()
    overlay.win.focus()
    overlay.setCollapsed(false) // show the answer
    const view = overlay.active()
    const name = nameOf(settings.active)
    setStatus(settings.autoSend ? `Sending to ${name}…` : `Pasting into ${name}…`)
    const result = await pasteIntoChat(view.webContents, {
      image,
      text: await screenshotPrompt(settings),
      autoSend: settings.autoSend
    })
    setStatus(resultStatus(result, name))
  } catch (err) {
    console.error('[capture]', err)
    setStatus(`Capture failed: ${(err as Error).message}`)
  } finally {
    busy = false
    broadcast()
  }
}

function resultStatus(result: 'sent' | 'pasted' | 'no-composer', name: string): string {
  return result === 'sent'
    ? `Sent to ${name}`
    : result === 'pasted'
      ? 'Pasted. Press Enter to send'
      : `Log in to ${name} first`
}

// ---- Listen mode: record meeting audio → transcribe locally → ask the AI ----

let listening = false
const transcriber = new Transcriber((pct) => {
  if (pct < 100) setStatus(`Downloading speech model ${pct}%`)
})

/** Hotkey/tray entry point: the toolbar page owns the recorder, so ask it to toggle. */
function toggleListen(): void {
  if (!listening && busy) return
  if (!overlay.win.isVisible()) overlay.win.showInactive()
  overlay.win.webContents.send('toggle-listen')
}

async function handleAudio(audio: Float32Array): Promise<void> {
  if (busy) return
  busy = true
  try {
    if (audio.length < 16000 * 0.5) {
      setStatus('Nothing recorded')
      return
    }
    setStatus('Transcribing…')
    // Read the duration now: the buffer is handed over (detached) to the worker thread.
    const seconds = audio.length / 16000
    const transcript = await transcriber.transcribe(audio, settings.whisperModel, settings.language)
    if (!transcript || /^\[.*\]$/.test(transcript)) {
      setStatus('No speech heard')
      return
    }
    if (process.env.MEETMIND_DRY_RUN) {
      // Testing aid: print the transcript instead of sending it to the AI tab.
      console.log(`[listen] dry run, ${seconds.toFixed(1)}s transcript: ${transcript}`)
      setStatus('Dry run done')
      return
    }
    overlay.setCollapsed(false) // show the answer
    const name = nameOf(settings.active)
    setStatus(settings.autoSend ? `Sending to ${name}…` : `Pasting into ${name}…`)
    const template = settings.audioPrompt.includes('{transcript}')
      ? settings.audioPrompt
      : `${settings.audioPrompt}\n\n"{transcript}"`
    const result = await pasteIntoChat(overlay.active().webContents, {
      text: template.replace('{transcript}', transcript),
      autoSend: settings.autoSend
    })
    setStatus(resultStatus(result, name))
  } catch (err) {
    console.error('[listen]', err)
    setStatus(`Transcription failed: ${(err as Error).message}`)
  } finally {
    busy = false
    broadcast()
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

/** 16×16 purple dot drawn in code, so the tray needs no image asset. */
function trayIcon(): Electron.NativeImage {
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
      { label: 'Show / hide   Ctrl+Shift+H', click: () => overlay.toggle() },
      { label: 'Capture & ask   Ctrl+Shift+Space', click: () => void captureAndAsk() },
      { label: 'Listen start/stop   Ctrl+Shift+L', click: () => toggleListen() },
      { type: 'separator' },
      { label: 'Quit MeetMind', click: () => app.quit() }
    ])
  )
  tray.on('click', () => overlay.toggle())
}

function setupShortcuts(): void {
  const bind = (accel: string, fn: () => void) => {
    if (!globalShortcut.register(accel, fn)) console.warn(`[shortcut] ${accel} is taken by another app`)
  }
  bind('CommandOrControl+Shift+Space', () => void captureAndAsk())
  bind('CommandOrControl+Shift+H', () => overlay.toggle())
  bind('CommandOrControl+Shift+L', () => toggleListen())
  PROVIDERS.forEach((p, i) => bind(`CommandOrControl+Shift+${i + 1}`, () => overlay.show(p.id)))
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
  ipcMain.on('listening', (_e, on: boolean) => {
    listening = !!on
    if (listening) {
      transcriber.preload(settings.whisperModel) // warm up the model while recording
      setStatus('Listening…')
    } else broadcast()
  })
  ipcMain.on('listen-error', (_e, message: string) => {
    listening = false
    console.error('[listen] start failed:', message)
    setStatus(`Can't listen: ${String(message).slice(0, 120)}`)
  })
  ipcMain.on('audio', (_e, audio: Float32Array) => {
    if (audio instanceof Float32Array) void handleAudio(audio)
  })
  ipcMain.on('set-listen', (_e, patch: Partial<Settings>) => {
    if (typeof patch.listenSystem === 'boolean') settings.listenSystem = patch.listenSystem
    if (typeof patch.listenMic === 'boolean') settings.listenMic = patch.listenMic
    if (WHISPER_MODELS.some((m) => m.id === patch.whisperModel)) settings.whisperModel = patch.whisperModel!
    if (LANGUAGES.some(([code]) => code === patch.language)) settings.language = patch.language!
    if (typeof patch.audioPrompt === 'string') settings.audioPrompt = patch.audioPrompt.slice(0, 2000)
    broadcast()
  })
  ipcMain.on('hide', () => overlay.win.hide())
  ipcMain.on('quit', () => app.quit())
}

app.whenReady().then(() => {
  setupSession()
  setupAudioCapture()
  setupIpc()
  overlay = new Overlay(settings, broadcast)
  setupTray()
  setupShortcuts()
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
