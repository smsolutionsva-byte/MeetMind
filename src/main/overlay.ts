import { BrowserWindow, WebContentsView, screen, session, type WebContents } from 'electron'
import { join } from 'path'
import { PROVIDERS, type ProviderId, type Settings } from '../shared/types'

/** Drag grip (14px) + toolbar (46px); keep in sync with --grip and --toolbar in styles.css. */
export const TOOLBAR_HEIGHT = 60
/** One persistent session shared by all AI tabs, so logins survive restarts. */
export const PARTITION = 'persist:meetmind'
const BG = '#101216'

/**
 * A clean desktop-Chrome user agent built from Electron's own Chromium version.
 * The default UA contains "Electron/x" and the app name, which Google sign-in
 * flags as an embedded browser. It must be a complete, well-formed string:
 * malformed UAs are reportedly rejected with 401 "malformed".
 */
export function chromeUserAgent(): string {
  const major = process.versions.chrome.split('.')[0]
  const platform =
    process.platform === 'win32'
      ? 'Windows NT 10.0; Win64; x64'
      : process.platform === 'darwin'
        ? 'Macintosh; Intel Mac OS X 10_15_7'
        : 'X11; Linux x86_64'
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
}

/** Hide from screen share / recordings, keep on top, stay out of the taskbar. */
export function makeStealthy(win: BrowserWindow): void {
  // MEETMIND_VISIBLE=1 keeps the window capturable, for README screenshots and UI testing.
  if (!process.env.MEETMIND_VISIBLE) win.setContentProtection(true)
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setSkipTaskbar(true)
}

export class Overlay {
  readonly win: BrowserWindow
  private views = new Map<ProviderId, WebContentsView>()

  constructor(
    private settings: Settings,
    private onChange: () => void
  ) {
    const area = screen.getPrimaryDisplay().workArea
    const width = 440
    const height = Math.min(680, area.height - 40)
    const b = settings.bounds && this.isOnScreen(settings.bounds)
      ? settings.bounds
      : { x: area.x + area.width - width - 20, y: area.y + 20, width, height }

    this.win = new BrowserWindow({
      ...b,
      minWidth: 340,
      minHeight: 260,
      frame: false,
      show: false,
      resizable: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: BG,
      title: 'MeetMind',
      // "toolbar" = tool window on Windows: no taskbar button and not in Alt+Tab.
      type: process.platform === 'win32' ? 'toolbar' : undefined,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true
      }
    })
    makeStealthy(this.win)
    this.win.setOpacity(settings.opacity)
    // First run: the tutorial uses the whole window, so keep the AI tab hidden.
    this.panelOpen = !settings.onboarded

    // Re-assert top-most after focus changes; some apps (Zoom) push themselves above.
    this.win.on('blur', () => {
      if (!this.win.isDestroyed()) this.win.setAlwaysOnTop(true, 'screen-saver')
    })
    this.win.on('resize', () => this.layout())
    // The collapsed strip has a fixed size; only + expands it.
    this.win.on('will-resize', (e) => {
      if (this.collapsed) e.preventDefault()
    })
    const remember = () => {
      if (this.win.isDestroyed() || this.win.isMinimized()) return
      const b = this.win.getBounds()
      // While collapsed only the position changes; keep the full-size height for next launch.
      this.settings.bounds = this.collapsed
        ? { ...b, height: this.expandedHeight }
        : b
      this.onChange()
    }
    this.win.on('moved', remember)
    this.win.on('resized', remember)

    if (process.env.ELECTRON_RENDERER_URL) this.win.loadURL(process.env.ELECTRON_RENDERER_URL)
    else this.win.loadFile(join(__dirname, '../renderer/index.html'))

    this.win.once('ready-to-show', () => {
      this.win.show()
      this.show(settings.active)
    })
  }

  private isOnScreen(b: { x: number; y: number; width: number; height: number }): boolean {
    return screen.getAllDisplays().some(({ workArea: a }) =>
      b.x + 60 > a.x && b.x < a.x + a.width - 60 && b.y >= a.y - 10 && b.y < a.y + a.height - 40
    )
  }

  /** Lazily create a provider tab; once created it stays alive in the background. */
  view(id: ProviderId): WebContentsView {
    let v = this.views.get(id)
    if (v) return v
    const provider = PROVIDERS.find((p) => p.id === id)!
    v = new WebContentsView({
      webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true }
    })
    v.setBackgroundColor(BG)
    wireWebContents(v.webContents, this.win)
    v.webContents.loadURL(provider.url)
    this.win.contentView.addChildView(v)
    this.views.set(id, v)
    this.layout()
    return v
  }

  /** While the settings panel is open the AI tab is hidden so the panel can use the full window. */
  private panelOpen = false
  /** Collapsed = only the toolbar strip is shown. */
  collapsed = false
  /** Outer height saved to settings while collapsed. */
  private expandedHeight = 0
  private expandedContentHeight = 0

  show(id: ProviderId): void {
    this.settings.active = id
    const hidden = this.panelOpen || this.collapsed
    const target = this.view(id)
    for (const [pid, v] of this.views) v.setVisible(pid === id && !hidden)
    target.setVisible(!hidden)
    this.onChange()
  }

  setPanel(open: boolean): void {
    this.panelOpen = open
    if (open && this.collapsed) this.setCollapsed(false)
    else this.show(this.settings.active)
  }

  /** Shrink to just the toolbar strip, or restore the full window. */
  setCollapsed(collapse: boolean): void {
    if (collapse === this.collapsed || this.win.isDestroyed()) return
    // Stay resizable and use content bounds throughout: toggling `resizable` on a frameless
    // Windows window changes its invisible border, and the size drifts on every cycle.
    // Manual resizing while collapsed is blocked in the 'will-resize' handler instead.
    const b = this.win.getContentBounds()
    if (collapse) {
      this.expandedHeight = this.win.getBounds().height
      this.expandedContentHeight = b.height
      this.collapsed = true
      this.show(this.settings.active) // hide the AI tab first so it doesn't flash while resizing
      this.win.setMinimumSize(340, 1)
      this.win.setContentBounds({ ...b, height: TOOLBAR_HEIGHT })
    } else {
      this.collapsed = false
      this.win.setContentBounds({ ...b, height: Math.max(260, this.expandedContentHeight || 680) })
      this.win.setMinimumSize(340, 260)
      this.show(this.settings.active)
    }
  }

  active(): WebContentsView {
    return this.view(this.settings.active)
  }

  layout(): void {
    if (this.win.isDestroyed()) return
    const [width, height] = this.win.getContentSize()
    const bounds = { x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(0, height - TOOLBAR_HEIGHT) }
    for (const v of this.views.values()) v.setBounds(bounds)
  }

  toggle(): void {
    if (this.win.isVisible()) this.win.hide()
    else {
      this.win.showInactive()
      makeStealthy(this.win)
    }
  }
}

/**
 * Shared handling for every page we host (tabs and their popups):
 * popups such as "Continue with Google" open as protected child windows in the
 * same session, never in the user's real browser (which would be on the screen share).
 */
function wireWebContents(wc: WebContents, parent: BrowserWindow): void {
  wc.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      parent,
      width: 520,
      height: 680,
      autoHideMenuBar: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#ffffff'
    }
  }))
  wc.on('did-create-window', (child) => {
    makeStealthy(child)
    wireWebContents(child.webContents, parent)
  })
}

/** Permissions for the AI sites: allow mic (voice mode) and clipboard, deny the rest. */
export function setupSession(): void {
  const ses = session.fromPartition(PARTITION)
  ses.setUserAgent(chromeUserAgent())
  const allowed = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen'])
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)))
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))
}
