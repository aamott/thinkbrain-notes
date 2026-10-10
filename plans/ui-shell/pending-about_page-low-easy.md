# About Location

**Status:** ⬜ pending · **Urgency:** low · **Difficulty:** easy

Users should be able to see the app version and a bit more (license,
repo link, platform/build info). Propose the best placement.

## Candidates

- **Settings tab, "About" section** — the most discoverable spot; settings
  already open as a tab, so it works identically on phone and desktop.
  Recommended unless a dedicated dialog is preferred.
- Desktop title-bar menu / drawer footer on phone — alternative if About
  should be chrome rather than content.

## Shape

- Version source: `tauri.conf.json` / package version at build time, plus
  commit or channel if available through the native bridge.
- Include app name, version, license, repository link, maybe data-path info
  useful for support reports.
