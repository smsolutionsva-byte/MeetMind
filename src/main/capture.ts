import { clipboard, desktopCapturer, screen, type NativeImage, type WebContents } from 'electron'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Screenshot of the display the cursor is on, at full physical resolution.
 * thumbnailSize must be size × scaleFactor, or captures are blurry on HiDPI screens.
 * Our own window is protected from capture, so it never shows up in the shot.
 */
export async function captureScreen(): Promise<NativeImage> {
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
  return source.thumbnail
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

/** Click the send button once it's enabled (i.e. the image finished uploading). */
const CLICK_SEND = `(() => {
  const btn = document.querySelector(
    'button[data-testid="send-button"], button[aria-label="Send message"], button[aria-label="Send prompt"], button[aria-label^="Send"]'
  );
  if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
  btn.click();
  return true;
})()`

async function waitForLoad(wc: WebContents, timeout = 15000): Promise<void> {
  if (!wc.isLoading()) return
  await Promise.race([
    new Promise<void>((r) => wc.once('did-stop-loading', () => r())),
    sleep(timeout)
  ])
}

async function run<T>(wc: WebContents, js: string): Promise<T | undefined> {
  try {
    return (await wc.executeJavaScript(js, true)) as T
  } catch {
    return undefined
  }
}

/**
 * Put an optional screenshot and some text into the chat box, and optionally send it.
 * Images go through the real clipboard + native paste, so each site's own upload logic
 * handles them; the user's previous clipboard text is restored afterwards.
 */
export async function pasteIntoChat(
  wc: WebContents,
  opts: { image?: NativeImage; text: string; autoSend: boolean }
): Promise<'sent' | 'pasted' | 'no-composer'> {
  await waitForLoad(wc)
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
    await wc.insertText(opts.text.trim())
  }

  if (!opts.autoSend) return 'pasted'

  // Poll for up to 20s while the upload finishes and the send button enables.
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    if (await run<boolean>(wc, CLICK_SEND)) return 'sent'
    await sleep(500)
  }
  // Fallback: press Enter in the composer.
  await run(wc, FOCUS_COMPOSER)
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
  wc.sendInputEvent({ type: 'char', keyCode: '\r' })
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
  return 'sent'
}
