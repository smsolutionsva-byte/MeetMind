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

export interface Settings {
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
