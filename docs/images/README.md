# Screenshot and illustration notes

Captured on 14 November 2026 on Windows using the actual Electron application, built from revision 94ec4dc. Capture used Playwright's Electron test interface, a separate signed-out temporary profile, and MEETMIND_VISIBLE=1. No meeting audio, screenshots of personal apps, AI prompts, personal logins or paid services were used. No new screenshot dependency was installed in MeetMind.

| Asset | Kind | State / scope |
|---|---|---|
| [meetmind-tour.png](meetmind-tour.png) | Actual app UI screenshot, 440×680 | First-run tour, before completing onboarding. The tour's blanket invisibility copy is an existing UI limitation; use the README's capture caveats. |
| [meetmind-settings.png](meetmind-settings.png) | Actual app UI screenshot, 440×680 | Settings open after skipping the tour; top of scrollable prompt/audio settings. No recording started. |
| [visibility-modes.svg](visibility-modes.svg) | Original explanatory diagram | Intended difference between the user's desktop and a compatible capture. Not a recording comparison, screenshot or verified platform compatibility result. |

The native Windows automation tool did not expose the app's toolbar-style window; Electron's app-test interface provided the UI captures instead. Capture protection was not validated against Zoom, Meet, Teams, OBS or macOS in this update. Existing normal-user profiles were not used or altered.
