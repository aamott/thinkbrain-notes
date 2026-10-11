# Story: About section in settings

Users currently have no way to see which app version they're running. Owner
decision: put About at the **bottom of the settings tab** — settings already
opens as a tab, so the same surface works on desktop and phone with no new
chrome.

## Decisions (made with owner)

- A static "About" section appended after the settings modules in
  `SettingsContent`, plus an entry in `SettingsNav` pinned last. It is not a
  settings module — nothing in it is stored.
- Contents (read-only rows):
  - App name + version (from `tauri.conf.json` → `../package.json`, today
    0.4.0).
  - Build/channel and platform/arch when cheaply available.
  - License: Apache-2.0.
  - Repository URL `https://github.com/aamott/thinkbrain-notes` as copyable
    text (make it a browser-opening link only if an `openUrl` adapter already
    exists — see `note_link_tap_follow_vs_edit`; do not add one here).
  - A support hint such as where settings/data live is welcome if it comes
    free from the same info source.
- Version reaches the renderer through `native/` — a small `app_info` command
  (or whatever fits the existing command table) returning name/version/
  platform via `app_handle.package_info()`. Browser/dev runs without Tauri
  fall back to the package.json version (vite define or equivalent) — the
  section must still render, not error.
- Out of scope: "Check for updates" button (the updater already owns that UX
  via `UpdateBanner`), telemetry/about dialogs, phone-native about screens.

## Acceptance

- [ ] Settings tab ends with an "About" section; `SettingsNav` lists it last
      and scroll-spy/anchor navigation reaches it like other sections.
- [ ] Shows at minimum app name, version, license (Apache-2.0), and repo URL;
      platform/arch and channel included when available from the same source.
- [ ] Version comes through a `native/` adapter inside Tauri; non-Tauri runs
      fall back to the packaged version — no blank/error state either way.
- [ ] Works on the phone settings screen unchanged (it renders the same
      settings tab).
- [ ] Unit tests cover the section render and the fallback path; `pnpm qa`
      green.

Relevant seams: `settings/SettingsContent.tsx` (section list + flattening —
append a static rendered section), `settings/SettingsNav.tsx`,
`settings/sectionUtils.ts` (anchor ids), `native/commands.ts` (add `app_info`),
`apps/desktop/src-tauri/src/commands/` (command impl), `tauri.conf.json`
(version source).
