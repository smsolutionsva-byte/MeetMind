import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AppState, PromptMode, ProviderId, Settings } from '../shared/types'

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
  setListen: (
    patch: Partial<Pick<Settings, 'listenSystem' | 'listenMic' | 'whisperModel' | 'language' | 'audioPrompt'>>
  ) => ipcRenderer.send('set-listen', patch),
  hide: () => ipcRenderer.send('hide'),
  quit: () => ipcRenderer.send('quit')
}

export type MeetMindApi = typeof api
contextBridge.exposeInMainWorld('meetmind', api)
