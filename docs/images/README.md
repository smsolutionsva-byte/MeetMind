# Screenshot and illustration notes

Captured on 14 November 2026 on Windows using the actual Electron application, built from revision 94ec4dc. Capture used Playwright's Electron test interface, a separate signed-out temporary profile, and MEETMIND_VISIBLE=1. No meeting audio, screenshots of personal apps, AI prompts, personal logins or paid services were used. No new screenshot dependency was installed in MeetMind.

| Asset | Kind | State / scope |
|---|---|---|
| [meetmind-tour.png](meetmind-tour.png) | Actual app UI screenshot, 440×680 | First-run tour, before completing onboarding. Captured before the welcome step gained its platform caveats; the app's current wording matches the README's capture notes. |
| [meetmind-settings.png](meetmind-settings.png) | Actual app UI screenshot, 440×680 | Settings open after skipping the tour; top of scrollable prompt/audio settings. No recording started. |
| [meetmind-setup-answers.png](meetmind-setup-answers.png) | Actual app UI screenshot, 440×680 | First-run setup, "Where should answers come from?" with option B (own API key) selected. No API key entered. |
| [meetmind-setup-listening.png](meetmind-setup-listening.png) | Actual app UI screenshot, 440×680 | First-run setup, "How should it listen?" with Always listening and the name trigger selected. No recording running. |
| [meetmind-setup-shortcuts.png](meetmind-setup-shortcuts.png) | Actual app UI screenshot, 440×680 | First-run setup, shortcut editor. "Screenshot and ask" was changed to Ctrl+Alt+K while testing the editor; the default is Ctrl+Shift+Space. |
| [meetmind-demo.gif](meetmind-demo.gif) | Screen recording, 960×506, ~20 s | Full screen showing a fictional "Demo Co." slide (local HTML in a full-screen browser) with MeetMind on the right in visible mode. One Ctrl+Shift+Space press: the screenshot and the "Detailed" prompt are pasted into ChatGPT in guest mode (not logged in) and the real answer streams in. Taskbar cropped out; recorded at 8 fps, repeated frames merged. |
| [visibility-modes.svg](visibility-modes.svg) | Original explanatory diagram | Intended difference between the user's desktop and a compatible capture. Not a recording comparison, screenshot or verified platform compatibility result. |

The three `meetmind-setup-*` screenshots were added later, from the code that became d9d40b3, captured just before a minor spacing tweak to the shortcut list. They were taken with a Windows screen copy of the app window, again with MEETMIND_VISIBLE=1 and a separate signed-out scratch profile; no AI prompt, API key, login or meeting audio was involved.

The native Windows automation tool did not expose the app's toolbar-style window; Electron's app-test interface provided the UI captures instead. Capture protection was not validated against Zoom, Meet, Teams, OBS or macOS in this update. Existing normal-user profiles were not used or altered.
