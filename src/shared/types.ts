export type ProviderId = 'chatgpt' | 'claude' | 'gemini'

export interface Provider {
  id: ProviderId
  name: string
  url: string
}

export const PROVIDERS: Provider[] = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/new' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app' }
]

export type AnswerSource = 'web' | 'api'
export type ApiProvider = 'anthropic' | 'openai' | 'gemini'
export type ListenMode = 'push' | 'live'
export type HotkeyAction = 'ask' | 'listen' | 'toggle' | 'tab1' | 'tab2' | 'tab3'
export type Hotkeys = Record<HotkeyAction, string>

export const API_PROVIDERS: { id: ApiProvider; name: string; defaultModel: string; keyUrl: string }[] = [
  { id: 'anthropic', name: 'Claude', defaultModel: 'claude-opus-5-5', keyUrl: 'https://platform.claude.com/settings/keys' },
  { id: 'openai', name: 'OpenAI', defaultModel: 'gpt-5.6-sol', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'gemini', name: 'Gemini', defaultModel: 'gemini-3.8-flash', keyUrl: 'https://aistudio.google.com/apikey' }
]

export const DEFAULT_HOTKEYS: Hotkeys = {
  ask: 'CommandOrControl+Shift+Space',
  listen: 'CommandOrControl+Shift+L',
  toggle: 'CommandOrControl+Shift+H',
  tab1: 'CommandOrControl+Shift+1',
  tab2: 'CommandOrControl+Shift+2',
  tab3: 'CommandOrControl+Shift+3'
}

export const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  ask: 'Screenshot and ask',
  listen: 'Listen start / stop',
  toggle: 'Show / hide',
  tab1: 'ChatGPT tab',
  tab2: 'Claude tab',
  tab3: 'Gemini tab'
}

/** One answer shown in the Answers panel (API mode). */
export interface Answer {
  id: number
  kind: 'screen' | 'audio'
  /** What was asked: the transcript, or "Screenshot". */
  question: string
  text: string
  done: boolean
  error?: string
  provider: string
}

export interface Settings {
  /** Where answers come from: your logged-in AI sites, or your own API key. */
  answerSource: AnswerSource
  apiProvider: ApiProvider
  apiModels: Record<ApiProvider, string>
  /** "push": press to start/stop. "live": always listening, answers questions automatically. */
  listenMode: ListenMode
  /** Live mode: answer every question, or only when your name is said. */
  liveTrigger: 'questions' | 'name'
  myName: string
  hotkeys: Hotkeys
  active: ProviderId
  /** Press send automatically after pasting the screenshot. */
  autoSend: boolean
  /** Which text goes with the screenshot (see PROMPT_PRESETS). */
  promptMode: PromptMode
  /** Used when promptMode is "custom". */
  customPrompt: string
  /** Optional .md/.txt file whose contents are added as context to every screenshot ask. */
  contextFile?: { name: string; path: string }
  /** First-run tutorial finished. */
  onboarded: boolean
  /** Window opacity, 0.3 – 1. */
  opacity: number
  /** Listen mode: capture system audio (everyone in the call). */
  listenSystem: boolean
  /** Listen mode: also capture your microphone. */
  listenMic: boolean
  /** Whisper model id on Hugging Face. */
  whisperModel: string
  /** Spoken language code ("en", "hi", "es"…); Whisper defaults to English otherwise. */
  language: string
  /** Prompt wrapped around the transcript; {transcript} is replaced. */
  audioPrompt: string
  bounds?: { x: number; y: number; width: number; height: number }
}

export interface AppState {
  settings: Settings
  /** Short status line shown in the toolbar ("Capturing…", "Sent to Claude"). */
  status: string
  busy: boolean
  /** Listen mode is recording right now. */
  listening: boolean
  /** Window is collapsed to the toolbar strip. */
  collapsed: boolean
  /** Which API providers have a saved key (the keys themselves never leave the main process). */
  apiKeySet: Record<ApiProvider, boolean>
  /** Hotkeys that failed to register because another app owns them. */
  hotkeyConflicts: HotkeyAction[]
  /** False when the OS can't hide the window from capture (Linux, old Windows). */
  protectionSupported: boolean
}

export const WHISPER_MODELS = [
  { id: 'onnx-community/whisper-tiny', label: 'Tiny: fastest, ~40 MB' },
  { id: 'onnx-community/whisper-base', label: 'Base: balanced, ~80 MB' },
  { id: 'onnx-community/whisper-small', label: 'Small: most accurate, ~250 MB' }
]

export const LANGUAGES = [
  ['en', 'English'], ['hi', 'Hindi'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'],
  ['pt', 'Portuguese'], ['it', 'Italian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'],
  ['ar', 'Arabic'], ['ru', 'Russian'], ['ur', 'Urdu'], ['bn', 'Bengali'], ['id', 'Indonesian']
] as const

export const DEFAULT_AUDIO_PROMPT =
  'Someone in my live meeting just said:\n"{transcript}"\n\nGive me a short, confident reply I can say out loud (1–3 sentences). If it contains a term I might not know, explain it in one line first.'

export type PromptMode = 'short' | 'detailed' | 'custom' | 'none'

export const PROMPT_PRESETS: { id: PromptMode; label: string; hint: string; text: string }[] = [
  {
    id: 'short',
    label: 'Short',
    hint: 'Fastest to read mid-call',
    text: 'Explain this in 1–2 sentences I can say out loud.'
  },
  {
    id: 'detailed',
    label: 'Detailed',
    hint: 'Answer plus one line of context',
    text: "I'm in a live meeting and this is my screen. Explain the key term or question shown in 1–2 short sentences I can say out loud, then one line of extra context."
  },
  {
    id: 'custom',
    label: 'My own',
    hint: 'Write your prompt and add a context file',
    text: ''
  },
  {
    id: 'none',
    label: 'No text',
    hint: 'Send only the screenshot',
    text: ''
  }
]

export const CUSTOM_PROMPT_EXAMPLE =
  'This is my company dashboard. Use the attached context to explain any keyword or number in the image in 1–2 sentences I can say out loud.'
