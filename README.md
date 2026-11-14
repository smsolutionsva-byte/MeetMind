# MeetMind

**An invisible AI copilot for online meetings.** A small floating window with your own ChatGPT, Claude and Gemini logged in, **hidden from screen share and recordings**. Press one hotkey: MeetMind screenshots your screen, pastes it into the AI with a prompt and sends it. You read the answer and keep talking.

> Boss asks "so what's driving the negative regression on inference cost?" mid-call. You press `Ctrl+Shift+Space`, glance at the overlay and answer like you knew it all along.

- 🫥 **Invisible on screen share.** Zoom, Meet, Teams, OBS and screenshots don't see it (Windows 10 2004+ / macOS).
- 🔐 **No API key needed.** Use your own ChatGPT / Claude / Gemini account. Log in once and the login is saved.
- 📸 **One-hotkey ask.** Screenshot → pasted into the chat with your prompt → sent automatically.
- 🎙️ **Listen mode.** Record what's said in the call, transcribe it **locally** with Whisper (free, private, no API key) and get a reply you can say out loud.
- ✍️ **Your prompt, your context.** Pick Short, Detailed, your own prompt with a context file (e.g. `context.md` about your company), or send only the screenshot.
- 🧭 **Built-in tour.** A first-run tutorial explains every button.
- 🪟 **Stays out of the way.** Always on top, no taskbar button, not in Alt+Tab, adjustable opacity.
- 🧠 **Free and open source.** Your data goes only to the AI site you're logged into.

## Hotkeys

| Keys | Action |
|---|---|
| `Ctrl+Shift+Space` | Screenshot and ask the AI |
| `Ctrl+Shift+L` | Start listening; press again to stop, transcribe and ask |
| `Ctrl+Shift+H` | Show / hide the window |
| `Ctrl+Shift+1 / 2 / 3` | Switch to ChatGPT / Claude / Gemini |

The tray icon (purple dot) also shows, hides and quits the app.

## Run from source

Requires Node.js 20+.

```bash
git clone <this repo>
cd MeetMind
npm install
npm run dev
```

`npm run build` builds into `out/`; `npm start` runs the built app.

Developer environment variables:

| Variable | Effect |
|---|---|
| `MEETMIND_VISIBLE=1` | Don't hide the window from capture (for screenshots, demo GIFs, UI testing) |
| `MEETMIND_USER_DATA=<folder>` | Use a separate profile (settings, logins, models) |
| `MEETMIND_DRY_RUN=1` | Listen mode prints the transcript instead of sending it to the AI |

## How it works

- **Hidden from capture:** `BrowserWindow.setContentProtection(true)`, which sets `WDA_EXCLUDEFROMCAPTURE` on Windows. Older Windows builds show a black box instead, and MeetMind warns you.
- **AI tabs:** each provider runs in a `WebContentsView` with a persistent `persist:meetmind` session, so cookies and logins survive restarts. Popups such as "Continue with Google" open as protected windows inside the app, never in your real browser.
- **Google sign-in:** the user-agent is a clean Chrome string built from Electron's own Chromium version, so sites don't treat it as an embedded browser. If Google still refuses, log in with email on that site.
- **Screenshot → chat:** captures the display your cursor is on at full HiDPI resolution, pastes it with the real clipboard (your clipboard text is restored afterwards), and clicks Send once the upload finishes.

- **Listen mode:** meeting audio comes from Windows loopback capture (`setDisplayMediaRequestHandler` with `audio: 'loopback'`), with your mic as an option. It's resampled to 16 kHz and transcribed by Whisper ([transformers.js](https://github.com/huggingface/transformers.js) + onnxruntime-node) in a worker thread. The model (~80 MB for Base) downloads once into the app's data folder. Nothing leaves your PC except the final text you send to the AI.

## Roadmap

- [x] 🎙️ Listen mode (record → local Whisper → ask)
- [ ] Continuous live transcript with automatic question detection
- [ ] ⌨️ "Type it" button to type the answer into another app
- [ ] 🔑 Optional API-key mode (Claude / OpenAI / Gemini / Ollama)
- [ ] Area screenshot (drag to select)
- [ ] Custom hotkeys, installers for Windows and macOS

## Notes

MeetMind is built for your own meetings and calls. It is not meant to get around exam proctoring or lockdown browsers. Check your company's policy on AI tools, and treat AI answers as a hint, not a fact.

Ideas for some tricky parts came from reading [free-cluely](https://github.com/Prat011/free-cluely) and [OpenCluely](https://github.com/TechyCSR/OpenCluely). No code was copied.

## License

MIT
