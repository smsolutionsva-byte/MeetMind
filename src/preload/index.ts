import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  Answer,
  AnswerSource,
  ApiProvider,
  AppState,
  HotkeyAction,
  PromptMode,
  ProviderId,
  Settings
} from '../shared/types'

/** Subscribe to a main → renderer channel; returns an unsubscribe function. */
function on<T>(channel: string, cb: (payload: T) => void) {
  const fn = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, fn)
  return (): void => {
    ipcRenderer.removeListener(channel, fn)
  }
}

const api = {
  getState: (): Promise<AppState> => ipcRenderer.invoke('get-state'),
  onState: (cb: (s: AppState) => void) => {
    const fn = (_e: IpcRendererEvent, s: AppState) => cb(s)
    ipcRenderer.on('state', fn)
    return (): void => {
      ipcRenderer.removeListener('state', fn)
    }
  },
  setProvider: (id: ProviderId) => ipcRenderer.send('set-provider', id),
  capture: () => ipcRenderer.send('capture'),
  setAutoSend: (v: boolean) => ipcRenderer.send('set-auto-send', v),
  setPromptMode: (mode: PromptMode) => ipcRenderer.send('set-prompt-mode', mode),
  setCustomPrompt: (v: string) => ipcRenderer.send('set-custom-prompt', v),
  /** Opens a file picker; resolves to an error message, or null when fine/cancelled. */
  pickContextFile: (): Promise<string | null> => ipcRenderer.invoke('pick-context-file'),
  clearContextFile: () => ipcRenderer.send('clear-context-file'),
  finishOnboarding: () => ipcRenderer.send('finish-onboarding'),
  setOpacity: (v: number) => ipcRenderer.send('set-opacity', v),
  reload: () => ipcRenderer.send('reload'),
  back: () => ipcRenderer.send('back'),
  setPanel: (open: boolean) => ipcRenderer.send('panel', open),
  setCollapsed: (collapse: boolean) => ipcRenderer.send('collapse', collapse),
  /** Main asks the page to start/stop recording (hotkey or tray). */
  onToggleListen: (cb: () => void) => {
    const fn = () => cb()
    ipcRenderer.on('toggle-listen', fn)
    return (): void => {
      ipcRenderer.removeListener('toggle-listen', fn)
    }
  },
  setListening: (on: boolean) => ipcRenderer.send('listening', on),
  listenError: (message: string) => ipcRenderer.send('listen-error', message),
  sendAudio: (audio: Float32Array) => ipcRenderer.send('audio', audio),
  sendLiveSegment: (audio: Float32Array) => ipcRenderer.send('live-segment', audio),
  onTranscript: (cb: (line: { text: string; at: number }) => void) => on('transcript', cb),
  onAnswer: (cb: (answer: Answer) => void) => on('answer', cb),
  setAnswerSource: (v: AnswerSource) => ipcRenderer.send('set-answer-source', v),
  setApi: (patch: { provider?: ApiProvider; model?: string }) => ipcRenderer.send('set-api', patch),
  /** Saves (or with an empty string, removes) a key; resolves to an error message or null. */
  setApiKey: (provider: ApiProvider, key: string): Promise<string | null> =>
    ipcRenderer.invoke('set-api-key', provider, key),
  setHotkey: (action: HotkeyAction, accel: string): Promise<string | null> =>
    ipcRenderer.invoke('set-hotkey', action, accel),
  resetHotkeys: () => ipcRenderer.send('reset-hotkeys'),
  pauseHotkeys: (paused: boolean) => ipcRenderer.send('pause-hotkeys', paused),
  setListen: (
    patch: Partial<
      Pick<
        Settings,
        | 'listenSystem'
        | 'listenMic'
        | 'whisperModel'
        | 'language'
        | 'audioPrompt'
        | 'listenMode'
        | 'liveTrigger'
        | 'myName'
      >
    >
  ) => ipcRenderer.send('set-listen', patch),
  /** Copies via the main process, which works even when the window isn't focused. */
  copyText: (text: string) => ipcRenderer.send('copy-text', text),
  onShowSupport: (cb: () => void) => on('show-support', cb),
  /** "open" opens the Ko-fi page; "supported" hides the reminder for good. */
  supportAction: (action: 'open' | 'supported') => ipcRenderer.send('support-action', action),
  hide: () => ipcRenderer.send('hide'),
  quit: () => ipcRenderer.send('quit')
}

export type MeetMindApi = typeof api
contextBridge.exposeInMainWorld('meetmind', api)
