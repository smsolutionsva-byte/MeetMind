# Feature ideas

Suggestions recorded on 14 November 2026 after inspecting the current source. These are proposals, not implemented or end-to-end verified features.

## Recommended next release

| Priority | Feature | Why it matters | Done when |
|---|---|---|---|
| 1 | Visible / Protected-intent badge | The environment flag is invisible in the current UI, and the tour currently makes a blanket invisibility claim | Toolbar and tour reflect the requested mode, platform limitations and a link to a manual capture test; no claim that an OS flag proves all recorders exclude the app |
| 1 | Hotkey conflict feedback | An isolated demo instance logged conflicts with an already-running instance | Settings name the failed shortcuts; users can choose alternatives; registrations roll back/retry safely |
| 1 | Region capture + preview/redaction | Current screenshot flow captures the whole display under the cursor | User selects a region, previews it, removes sensitive areas, confirms provider/send and cancels without sending |
| 1 | Cancel / timeout for transcription | Long model loads and jobs need an escape and useful recovery | Cancel terminates/releases work safely; errors reset busy state; retries avoid duplicate sends; model-download and transcription stages are distinguishable |
| 2 | Push-to-talk and a clear recording indicator | Intentional short recordings are easier to manage | User can hold a configured shortcut, see duration/source and stop/cancel; no hidden always-on recording |
| 2 | Local transcript export | Meeting follow-up is useful beyond a single reply | Explicit opt-in, Markdown/text export, local retention control and clear/delete; no silent transcript archive |
| 2 | Model/download manager | Speech models are substantial downloads | Cached/not-cached/download-progress states, disk size, cancel/retry, and truthful offline readiness |
| 2 | Provider integration health checks | Embedded web UI, sign-in and selectors can change | Each provider has isolated checks; actionable login/composer/upload errors; no automatic retry that sends twice |
| 2 | CI and release packaging | A source-only setup adds friction | Typecheck/build CI, smoke tests and versioned Windows installer; signing and macOS packaging documented separately |

## Later experiments

- Live transcription with visible recording consent/status, bounded memory and user-controlled question suggestions.
- Optional API credentials or local Ollama adapter, with secret storage and explicit cost/network disclosure.
- Per-meeting prompt/context presets; warn which file/text is sent before using a preset.
- Accessibility pass: keyboard operation, focus handling, screen-reader labels, high contrast and reduced motion.
- Multi-display controls: user chooses display/region; remember placement without restoring off-screen.
- “Type it” action only with destination preview and explicit confirmation. Avoid typing into another app from a guessed focus.

## Avoid duplicating current features

Automatic sending already has a Settings switch. New work should improve preview/confirmation around it, not advertise the existing switch as missing. Prompt presets, speech-language selection, opacity, local context and provider tabs also already exist.

## Suggested first slice

Mode badge + accurate tour copy + hotkey conflict feedback. It is a small, user-visible improvement that removes ambiguity exposed by the README/demo work. Region capture can follow as a separate change.

## Verification boundaries

This documentation update built and typechecked the project, and captured real tour/settings UI in a separate signed-out profile. It did not record meetings, submit prompts, test speech accuracy, exercise real provider authentication, or establish screen-sharing compatibility. Do not turn these suggestions into shipping claims until their acceptance checks pass.

