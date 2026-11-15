import {
  BrowserWindow,
  clipboard,
  desktopCapturer,
  globalShortcut,
  screen,
  type Display,
  type NativeImage,
  type Rectangle,
  type WebContents
} from 'electron'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Screenshot of the display the cursor is on, at full physical resolution.
 * thumbnailSize must be size × scaleFactor, or captures are blurry on HiDPI screens.
 * Our own window is protected from capture, so it never shows up in the shot.
 */
export async function captureScreen(): Promise<{ image: NativeImage; display: Display }> {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { width, height } = display.size
  const sf = display.scaleFactor || 1
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(width * sf), height: Math.round(height * sf) }
  })
  if (!sources.length) throw new Error('No screen available to capture')
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  if (source.thumbnail.isEmpty()) throw new Error('Screen capture returned an empty image')
  return { image: source.thumbnail, display }
}

/**
 * Big screenshots (4K, HiDPI) make the AI site slow: every pasted image stays in the chat page.
 * The AIs scale images down anyway (to about 1.5–2k pixels), so this loses no detail they'd use.
 */
export function fitForUpload(image: NativeImage, maxEdge = 1920): NativeImage {
  const { width, height } = image.getSize()
  const long = Math.max(width, height)
  if (long <= maxEdge) return image
  const k = maxEdge / long
  return image.resize({ width: Math.round(width * k), height: Math.round(height * k), quality: 'best' })
}

/** A picked area, in the picker page's pixels, plus that page's size (the screenshot fills it). */
export type PickedArea = Rectangle & { viewW: number; viewH: number }

/** Cut the picked area out of the screenshot the picker showed. */
export function cropToArea(image: NativeImage, area: PickedArea): NativeImage {
  const { width, height } = image.getSize()
  const kx = width / area.viewW
  const ky = height / area.viewH
  const x = Math.max(0, Math.round(area.x * kx))
  const y = Math.max(0, Math.round(area.y * ky))
  return image.crop({
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.round(area.width * kx))),
    height: Math.max(1, Math.min(height - y, Math.round(area.height * ky)))
  })
}

const SELECT_HTML = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;height:100%;overflow:hidden;cursor:crosshair;user-select:none;font:13px "Segoe UI",system-ui,sans-serif;background:#000 center/100% 100% no-repeat}
.pane{position:fixed;background:rgba(10,12,16,.5)}
#box{position:fixed;display:none;outline:2px solid #a78bfa}
#hint{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(22,24,29,.94);color:#e8eaef;padding:9px 16px;border-radius:999px;border:1px solid #2a2e37;pointer-events:none;white-space:nowrap}
#hint b{color:#c4b5fd;font-weight:600}
#size{position:fixed;display:none;background:rgba(22,24,29,.94);color:#e8eaef;padding:2px 7px;border-radius:6px;font-size:11px;pointer-events:none}
</style>
<div class="pane" id="pt" style="inset:0"></div><div class="pane" id="pb"></div><div class="pane" id="pl"></div><div class="pane" id="pr"></div><div id="box"></div><div id="size"></div>
<div id="hint"><b>Drag</b> to pick an area · <b>Click</b> for the whole screen · <b>Esc</b> to cancel</div>
<script>
window.pick = new Promise((resolve) => {
  const $ = (id) => document.getElementById(id)
  const box = $('box'), size = $('size'), pt = $('pt'), pb = $('pb'), pl = $('pl'), pr = $('pr')
  // Four dim panes around the picked area, so it stays bright.
  const frame = (r) => {
    const W = innerWidth, H = innerHeight, px = (v) => v + 'px'
    Object.assign(pt.style, { inset: '', left: '0', top: '0', width: px(W), height: px(r.y) })
    Object.assign(pb.style, { left: '0', top: px(r.y + r.height), width: px(W), height: px(Math.max(0, H - r.y - r.height)) })
    Object.assign(pl.style, { left: '0', top: px(r.y), width: px(r.x), height: px(r.height) })
    Object.assign(pr.style, { left: px(r.x + r.width), top: px(r.y), width: px(Math.max(0, W - r.x - r.width)), height: px(r.height) })
  }
  let sx = 0, sy = 0, down = false
  const rect = (e) => ({ x: Math.min(sx, e.clientX), y: Math.min(sy, e.clientY), width: Math.abs(e.clientX - sx), height: Math.abs(e.clientY - sy) })
  addEventListener('mousedown', (e) => { if (e.button !== 0) return resolve(null); down = true; sx = e.clientX; sy = e.clientY })
  addEventListener('mousemove', (e) => {
    if (!down) return
    const r = rect(e)
    frame(r); box.style.display = 'block'; size.style.display = 'block'
    Object.assign(box.style, { left: r.x + 'px', top: r.y + 'px', width: r.width + 'px', height: r.height + 'px' })
    size.textContent = r.width + ' × ' + r.height
    Object.assign(size.style, { left: r.x + 'px', top: Math.max(0, r.y - 24) + 'px' })
  })
  addEventListener('mouseup', (e) => {
    if (!down) return
    down = false
    const r = rect(e)
    resolve(r.width < 8 || r.height < 8 ? 'full' : { ...r, viewW: innerWidth, viewH: innerHeight })
  })
  addEventListener('keydown', (e) => { if (e.key === 'Escape') resolve(null) })
  addEventListener('contextmenu', (e) => { e.preventDefault(); resolve(null) })
})
</script>`

/**
 * Shows the screenshot just taken, frozen and dimmed, over the whole display, and lets the
 * user drag out an area (like a snipping tool). An opaque window with the shot as background
 * looks the same everywhere; see-through windows don't reliably dim on Windows.
 * Resolves to the area, 'full' for a plain click, or null when cancelled
 * (Esc, right-click, or no pick within a minute).
 */
export async function selectArea(display: Display, shot: NativeImage): Promise<PickedArea | 'full' | null> {
  const win = new BrowserWindow({
    ...display.bounds,
    frame: false,
    backgroundColor: '#000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    thickFrame: false, // otherwise Windows trims a frameless window to less than the screen
    enableLargerThanScreen: true,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true }
  })
  if (!process.env.MEETMIND_VISIBLE) win.setContentProtection(true)
  win.setAlwaysOnTop(true, 'screen-saver', 1) // one level above MeetMind's own window
  win.setBounds(display.bounds) // again after creation: Windows can shift frameless windows on HiDPI
  // Windows doesn't always hand keyboard focus to a window opened from a hotkey,
  // so Esc is caught globally while the picker is open.
  const escOwned = globalShortcut.register('Escape', () => {
    if (!win.isDestroyed()) win.destroy()
  })
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(SELECT_HTML))
    const bg = 'data:image/jpeg;base64,' + shot.toJPEG(88).toString('base64')
    await win.webContents.executeJavaScript(`document.body.style.backgroundImage = "url('${bg}')"`, true)
    win.show()
    win.moveTop()
    win.focus()
    const result = await Promise.race([
      win.webContents.executeJavaScript('window.pick', true) as Promise<PickedArea | 'full' | null>,
      new Promise<null>((r) => win.once('closed', () => r(null))),
      sleep(60_000).then(() => null)
    ])
    return result
  } catch {
    return null
  } finally {
    if (escOwned) globalShortcut.unregister('Escape')
    if (!win.isDestroyed()) win.destroy()
  }
}

/** Focus the chat box of ChatGPT / Claude / Gemini and put the caret at the end. */
const FOCUS_COMPOSER = `(() => {
  const el = document.querySelector(
    '#prompt-textarea, div.ProseMirror[contenteditable="true"], rich-textarea [contenteditable="true"], div[contenteditable="true"], textarea'
  );
  if (!el) return false;
  el.focus();
  if (el.isContentEditable) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  return true;
})()`

const SEND_BUTTON = `document.querySelector(
  'button[data-testid="send-button"], button[aria-label="Send message"], button[aria-label="Send prompt"], button[aria-label^="Send"]'
)`

/** Click the send button once it's enabled (i.e. the image finished uploading). */
const CLICK_SEND = `(() => {
  const btn = ${SEND_BUTTON};
  if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
  btn.click();
  return true;
})()`

/** True while there's an enabled send button, i.e. something is still waiting in the chat box. */
const SEND_READY = `(() => {
  const btn = ${SEND_BUTTON};
  return !!btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true';
})()`

/** The site is still writing its previous answer (it shows a Stop button instead of Send). */
const IS_ANSWERING = `[...document.querySelectorAll(
  'button[data-testid="stop-button"], button[aria-label="Stop response"], button[aria-label="Stop generating"], button[aria-label="Stop streaming"], button[aria-label="Stop"]'
)].some((b) => b.getClientRects().length > 0)`

async function waitForLoad(wc: WebContents, timeout = 15000): Promise<void> {
  if (!wc.isLoading()) return
  await Promise.race([
    new Promise<void>((r) => wc.once('did-stop-loading', () => r())),
    sleep(timeout)
  ])
}

/**
 * Run a snippet in the page, giving up after `timeout` ms. A busy page (a long chat full of
 * screenshots) can take forever to answer, and waiting on it used to leave "Sending…" stuck.
 */
async function run<T>(wc: WebContents, js: string, timeout = 5000): Promise<T | undefined> {
  if (wc.isDestroyed()) return undefined
  try {
    return await Promise.race([wc.executeJavaScript(js, true) as Promise<T>, sleep(timeout).then(() => undefined)])
  } catch {
    return undefined
  }
}

export type PasteResult = 'sent' | 'pasted' | 'no-composer' | 'not-sent'

/**
 * Put an optional screenshot and some text into the chat box, and optionally send it.
 * Images go through the real clipboard + native paste, so each site's own upload logic
 * handles them; the user's previous clipboard text is restored afterwards.
 */
export async function pasteIntoChat(
  wc: WebContents,
  opts: { image?: NativeImage; text: string; autoSend: boolean; onWaiting?: () => void }
): Promise<PasteResult> {
  await waitForLoad(wc)

  // Still writing the last answer? The send button is a Stop button until it's done,
  // so a new message can't go out yet. Wait (up to 90s) instead of pasting into a busy chat.
  if (await run<boolean>(wc, IS_ANSWERING)) {
    opts.onWaiting?.()
    const until = Date.now() + 90_000
    while (Date.now() < until && (await run<boolean>(wc, IS_ANSWERING))) await sleep(700)
  }

  wc.focus()
  if (!(await run<boolean>(wc, FOCUS_COMPOSER))) return 'no-composer'

  if (opts.image) {
    const previousText = clipboard.readText()
    clipboard.writeImage(opts.image)
    wc.paste()
    await sleep(400)
    // Give the page a moment to read the image before we put the old text back.
    setTimeout(() => {
      if (previousText) clipboard.writeText(previousText)
    }, 1500)
  }
  if (opts.text.trim()) {
    await run(wc, FOCUS_COMPOSER)
    await Promise.race([wc.insertText(opts.text.trim()), sleep(5000)])
  }

  if (!opts.autoSend) return 'pasted'

  // Poll for up to 25s while the upload finishes and the send button enables.
  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    if (await run<boolean>(wc, CLICK_SEND)) return 'sent'
    await sleep(500)
  }
  // Fallback: press Enter in the composer, then check it actually went.
  await run(wc, FOCUS_COMPOSER)
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
  wc.sendInputEvent({ type: 'char', keyCode: '\r' })
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
  await sleep(1200)
  // false = chat box emptied, so it went. true (still waiting) or no reply (page frozen) = it didn't.
  return (await run<boolean>(wc, SEND_READY)) === false ? 'sent' : 'not-sent'
}
