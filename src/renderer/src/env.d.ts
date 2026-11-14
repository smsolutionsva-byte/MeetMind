import type { MeetMindApi } from '../../preload'

declare global {
  interface Window {
    meetmind: MeetMindApi
  }
}

export {}
