import { BrowserWindow, WebContentsView, screen, session, shell, type WebContents } from 'electron'
import { join } from 'path'
import { PROVIDERS, type ProviderId, type Settings } from '../shared/types'

/** Drag grip (14px) + toolbar (46px); keep in sync with --grip and --toolbar in styles.css. */
export const TOOLBAR_HEIGHT = 60
/** Live-caption strip under the toolbar while always-listening; keep in sync with --transcript. */
export const TRANSCRIPT_HEIGHT = 34
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

/**
 * Google's interactive sign-in pages. Google refuses them inside apps that embed a browser
 * ("This browser or app may not be secure"), so MeetMind shows its own explanation instead.
 * Passive login checks (`passive=`) that Google sites do on load are left alone.
 */
export function isGoogleSignIn(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.hostname !== 'accounts.google.com' || u.searchParams.has('passive')) return false
  return /^\/(o\/oauth2|signin|v3\/signin|ServiceLogin|AccountChooser|InteractiveLogin)/i.test(u.pathname)
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
  /** Called when a tab tries to open Google sign-in (the page is stopped first). */
  onGoogleSignIn: (provider: ProviderId) => void = () => {}
  /** "Try anyway" lets Google sign-in through until this time. */
  private googleAllowedUntil = 0
  private blockedGoogle?: { wc: WebContents; url: string }
  /** When each tab last finished moving to a new page, to spot pages that only forward. */
  private committedAt = new WeakMap<WebContents, number>()

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

    // Links in MeetMind's own UI (e.g. "Get an API key") open in the user's normal browser.
    this.win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })

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
    wireWebContents(v.webContents, this.win, (wc, url) => this.guardGoogle(id, wc, url))
    const wc = v.webContents
    wc.on('did-navigate', () => this.committedAt.set(wc, Date.now()))
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
  /** API mode: answers render in MeetMind's own panel, so no AI website is shown (or loaded). */
  private webHidden = false
  private transcriptBar = false

  private get headerHeight(): number {
    return TOOLBAR_HEIGHT + (this.transcriptBar ? TRANSCRIPT_HEIGHT : 0)
  }

  show(id: ProviderId): void {
    this.settings.active = id
    if (this.webHidden) {
      for (const v of this.views.values()) v.setVisible(false)
      this.onChange()
      return
    }
    const hidden = this.panelOpen || this.collapsed
    const target = this.view(id)
    for (const [pid, v] of this.views) v.setVisible(pid === id && !hidden)
    target.setVisible(!hidden)
    this.onChange()
  }

  setWebHidden(hidden: boolean): void {
    this.webHidden = hidden
    this.updateFocusable()
    this.show(this.settings.active)
  }

  /**
   * In API mode with no settings/setup open, nothing in MeetMind needs the keyboard, so the
   * window stops taking focus: clicking Ask or the mic leaves your meeting tab, document or
   * chat box focused (and typing where it was). Web mode needs focus to paste into the AI site,
   * and Settings needs it for text fields.
   */
  private updateFocusable(): void {
    if (this.win.isDestroyed()) return
    const focusable = !(this.webHidden && !this.panelOpen)
    // Closing Settings while typing in it: give focus back to the app underneath instead of
    // leaving no window focused.
    if (!focusable && this.win.isFocused()) this.win.blur()
    this.win.setFocusable(focusable)
  }

  /** Show/hide the live-caption strip; the AI tab (or the collapsed strip) makes room for it. */
  setTranscriptBar(on: boolean): void {
    if (on === this.transcriptBar || this.win.isDestroyed()) return
    this.transcriptBar = on
    if (this.collapsed) {
      const b = this.win.getContentBounds()
      this.win.setContentBounds({ ...b, height: this.headerHeight })
    }
    this.layout()
  }

  setPanel(open: boolean): void {
    this.panelOpen = open
    this.updateFocusable()
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
      this.win.setContentBounds({ ...b, height: this.headerHeight })
    } else {
      this.collapsed = false
      this.win.setContentBounds({ ...b, height: Math.max(260, this.expandedContentHeight || 680) })
      this.win.setMinimumSize(340, 260)
      this.show(this.settings.active)
    }
  }

  /** Returns true when the navigation to `url` was stopped because it is Google sign-in. */
  private guardGoogle(provider: ProviderId, wc: WebContents | null, url: string): boolean {
    if (!isGoogleSignIn(url) || Date.now() < this.googleAllowedUntil) return false
    // A popup that went straight to Google would sit empty on top of the notice: close it.
    const child = wc && BrowserWindow.fromWebContents(wc)
    if (child && child !== this.win && !child.isDestroyed()) {
      child.close()
      wc = null
    }
    this.blockedGoogle = wc ? { wc, url } : undefined
    if (wc) void this.leaveBlankPage(provider, wc)
    this.onGoogleSignIn(provider)
    return true
  }

  /**
   * ChatGPT's Google button goes through an in-between page that only forwards to Google.
   * With Google stopped, that page stays blank (or shows a "Continue" that leads back to
   * Google), so step back to the page the user was on. A page counts as in-between when it
   * forwarded within 3 s of loading, or when it is empty.
   */
  private async leaveBlankPage(provider: ProviderId, wc: WebContents): Promise<void> {
    const forwarder = Date.now() - (this.committedAt.get(wc) ?? 0) < 3000
    await new Promise((r) => setTimeout(r, forwarder ? 0 : 400))
    if (wc.isDestroyed()) return
    if (!forwarder) {
      const chars: number = await wc
        .executeJavaScript('(document.body?.innerText || "").trim().length')
        .catch(() => 0)
      if (chars > 0 || wc.isDestroyed()) return
    }
    if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
    else void wc.loadURL(PROVIDERS.find((p) => p.id === provider)!.url)
  }

  /**
   * "Try anyway": let Google sign-in through for two minutes and reopen the page that was
   * stopped. Returns false when it was a popup, so the user has to click the button again.
   */
  allowGoogleSignIn(): boolean {
    this.googleAllowedUntil = Date.now() + 120_000
    const b = this.blockedGoogle
    this.blockedGoogle = undefined
    if (!b || b.wc.isDestroyed()) return false
    void b.wc.loadURL(b.url)
    return true
  }

  active(): WebContentsView {
    return this.view(this.settings.active)
  }

  layout(): void {
    if (this.win.isDestroyed()) return
    const [width, height] = this.win.getContentSize()
    const top = this.headerHeight
    const bounds = { x: 0, y: top, width, height: Math.max(0, height - top) }
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
function wireWebContents(
  wc: WebContents,
  parent: BrowserWindow,
  blockGoogle: (wc: WebContents | null, url: string) => boolean
): void {
  const guard = (e: { preventDefault(): void; url: string; isMainFrame: boolean }) => {
    if (e.isMainFrame && blockGoogle(wc, e.url)) e.preventDefault()
  }
  wc.on('will-navigate', guard)
  wc.on('will-redirect', guard)
  wc.setWindowOpenHandler(({ url }) => {
    if (blockGoogle(null, url)) return { action: 'deny' }
    return {
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
    }
  })
  wc.on('did-create-window', (child) => {
    makeStealthy(child)
    wireWebContents(child.webContents, parent, blockGoogle)
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
