# Feature ideas

Suggestions first recorded on 14 November 2026 after inspecting the source, and updated after commit d9d40b3. Items under "Shipped" exist in the code; everything else is a proposal, not an implemented or end-to-end verified feature.

## Shipped since the first list

| Feature | What exists now | Verified so far | Still open |
|---|---|---|---|
| Hotkey conflict feedback | All global shortcuts are editable in Settings → Shortcuts; shortcuts another app owns are flagged in red; duplicates within MeetMind are rejected; "Reset to defaults" | Changing a shortcut through the editor in a demo profile; registration re-runs after each change | No suggested alternatives yet; macOS untested |
| Always-on recording indicator (live mode) | Optional "Always listening" mode with a red LIVE captions strip and a pulsing toolbar button while it runs; off by default; turned on and off by the user | A recorded test clip played through speakers: the statement was ignored, the question was detected (dry run, nothing sent) | No hold-to-talk; no visible list of past captions; detection is a heuristic (question words / "?"), not a model |
| Optional API credentials | "Use my own API key" mode for Claude, OpenAI and Gemini via official SDKs; keys encrypted with Electron safeStorage and kept in the main process; answers stream into an in-app panel | Typecheck against the installed SDKs; no-key path shows a clear message | Real provider calls not exercised in this update; no cost display; no local Ollama adapter |
| Setup choices | First-run A/B setup (AI accounts vs. API key, press vs. always listening, shortcuts) before the tour; re-runnable from Settings | Clicked through every step in a demo profile | Tour welcome copy still says "hidden from screen share" without the platform caveat (see priority 1 below) |

## Recommended next release

| Priority | Feature | Why it matters | Done when |
|---|---|---|---|
| 1 | Visible / Protected-intent badge | The environment flag is invisible in the UI, and the tour welcome makes a blanket invisibility claim | Toolbar and tour reflect the requested mode, platform limitations and a link to a manual capture test; no claim that an OS flag proves all recorders exclude the app |
| 1 | Region capture + preview/redaction | Current screenshot flow captures the whole display under the cursor | User selects a region, previews it, removes sensitive areas, confirms provider/send and cancels without sending |
| 1 | Cancel / timeout for transcription | Long model loads and jobs need an escape and useful recovery | Cancel terminates/releases work safely; errors reset busy state; retries avoid duplicate sends; model-download and transcription stages are distinguishable |
| 2 | Hold-to-talk | Some users prefer holding a key over toggling | User can hold a configured shortcut, see duration/source and release to send or cancel |
| 2 | Local transcript export | Meeting follow-up is useful beyond a single reply; live mode already produces captions | Explicit opt-in, Markdown/text export, local retention control and clear/delete; no silent transcript archive |
| 2 | API usage and cost visibility | API-key mode bills the user per request | Per-answer token/cost estimate where the provider reports usage; clear indicator of which provider and model answered |
| 2 | Model/download manager | Speech models are substantial downloads | Cached/not-cached/download-progress states, disk size, cancel/retry, and truthful offline readiness |
| 2 | Provider integration health checks | Embedded web UI, sign-in and selectors can change | Each provider has isolated checks; actionable login/composer/upload errors; no automatic retry that sends twice |
| 2 | CI and release packaging | A source-only setup adds friction | Typecheck/build CI, smoke tests and versioned Windows installer; signing and macOS packaging documented separately |

## Later experiments

- Local Ollama adapter for fully offline answers, with explicit model download and hardware disclosure.
- Smarter live-mode triggers: detect questions aimed at the user from context instead of keywords, with a visible "why this triggered" note.
- Per-meeting prompt/context presets; warn which file/text is sent before using a preset.
- Accessibility pass: keyboard operation, focus handling, screen-reader labels, high contrast and reduced motion.
- Multi-display controls: user chooses display/region; remember placement without restoring off-screen.
- “Type it” action only with destination preview and explicit confirmation. Avoid typing into another app from a guessed focus.

## Avoid duplicating current features

Automatic sending already has a Settings switch. New work should improve preview/confirmation around it, not advertise the existing switch as missing. Prompt presets, speech-language selection, opacity, local context, provider tabs, API-key mode, always-listening mode and configurable shortcuts also already exist.

## Suggested first slice

Mode badge + accurate tour copy. It is a small, user-visible improvement that removes the remaining ambiguity in the welcome step. Region capture can follow as a separate change.

## Verification boundaries

The first documentation update built and typechecked the project and captured real tour/settings UI in a separate signed-out profile. The d9d40b3 update additionally exercised, in a separate scratch profile: the setup steps, the shortcut editor, the no-key API path, and live-mode transcription/question detection on a synthetic speech clip in dry-run mode. Neither update submitted prompts to a provider, exercised real provider authentication or API keys, recorded a real meeting, or established screen-sharing compatibility. Do not turn the open items into shipping claims until their acceptance checks pass.
