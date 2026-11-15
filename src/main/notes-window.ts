import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'

let win: BrowserWindow | null = null

export function notesWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null
}

/**
 * Meeting notes: a normal-sized window for browsing history, summaries and questions.
 * Like the floating window it is hidden from screen share and kept off the taskbar, so
 * opening it mid-meeting doesn't show up for others. It is not always-on-top.
 */
export function openNotesWindow(): BrowserWindow {
  const existing = notesWindow()
  if (existing) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    return existing
  }
  const area = screen.getPrimaryDisplay().workArea
  const width = Math.min(1040, area.width - 80)
  const height = Math.min(700, area.height - 80)
  win = new BrowserWindow({
    width,
    height,
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    minWidth: 720,
    minHeight: 460,
    show: false,
    skipTaskbar: true,
    backgroundColor: '#101216',
    title: 'MeetMind Notes',
    titleBarStyle: 'hidden',
    titleBarOverlay:
      process.platform === 'win32' ? { color: '#101216', symbolColor: '#e8eaef', height: 40 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })
  // MEETMIND_VISIBLE=1 keeps it capturable, for screenshots and UI testing.
  if (!process.env.MEETMIND_VISIBLE) win.setContentProtection(true)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/notes.html`)
  else void win.loadFile(join(__dirname, '../renderer/notes.html'))
  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
  })
  return win
}
