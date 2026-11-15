import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import {
  API_PROVIDERS,
  DEFAULT_HOTKEYS,
  DEFAULT_AUDIO_PROMPT,
  PROMPT_PRESETS,
  PROVIDERS,
  WHISPER_MODELS,
  type Settings
} from '../shared/types'

const file = () => join(app.getPath('userData'), 'settings.json')

const defaults: Settings = {
  support: { launches: 0, lastShown: 0, supported: false },
  answerSource: 'web',
  apiProvider: 'anthropic',
  apiModels: Object.fromEntries(API_PROVIDERS.map((p) => [p.id, p.defaultModel])) as Settings['apiModels'],
  listenMode: 'push',
  liveTrigger: 'questions',
  myName: '',
  hotkeys: { ...DEFAULT_HOTKEYS },
  active: 'chatgpt',
  autoSend: true,
  captureArea: 'full',
  promptMode: 'short',
  customPrompt: '',
  onboarded: false,
  opacity: 1,
  listenSystem: true,
  listenMic: false,
  whisperModel: 'onnx-community/whisper-base',
  language: 'en',
  audioPrompt: DEFAULT_AUDIO_PROMPT,
  saveHistory: true
}

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Settings> & { prompt?: string }
    // v0.1 stored a single "prompt" string; drop it in favour of presets.
    const { prompt: _legacy, ...rest } = raw
    const s: Settings = { ...defaults, ...rest }
    if (!PROMPT_PRESETS.some((p) => p.id === s.promptMode)) s.promptMode = defaults.promptMode
    // Merge nested objects so new keys get defaults.
    s.hotkeys = { ...DEFAULT_HOTKEYS, ...(rest.hotkeys ?? {}) }
    s.support = { ...defaults.support, ...(rest.support ?? {}) }
    s.apiModels = { ...defaults.apiModels, ...(rest.apiModels ?? {}) }
    if (!API_PROVIDERS.some((p) => p.id === s.apiProvider)) s.apiProvider = defaults.apiProvider
    if (s.answerSource !== 'api') s.answerSource = 'web'
    if (s.listenMode !== 'live') s.listenMode = 'push'
    if (s.captureArea !== 'select') s.captureArea = 'full'
    if (!PROVIDERS.some((p) => p.id === s.active)) s.active = defaults.active
    s.opacity = Math.min(1, Math.max(0.3, Number(s.opacity) || 1))
    if (!WHISPER_MODELS.some((m) => m.id === s.whisperModel)) s.whisperModel = defaults.whisperModel
    return s
  } catch {
    return { ...defaults }
  }
}

let timer: NodeJS.Timeout | undefined
/** Debounced write so dragging/resizing doesn't hammer the disk. */
export function saveSettings(s: Settings): void {
  clearTimeout(timer)
  timer = setTimeout(() => {
    try {
      mkdirSync(dirname(file()), { recursive: true })
      writeFileSync(file(), JSON.stringify(s, null, 2))
    } catch (err) {
      console.error('[settings] save failed', err)
    }
  }, 300)
}
