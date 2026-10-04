# Changelog

Newest first. Versions follow [semver](https://semver.org), except that before
1.0 a minor bump may still change behaviour.

## 0.3.0-3 — 2026-10-04

Prerelease for preview-style file tabs, the audio/video playback fix, and a
broad architecture consolidation of the shell, settings, and sync layers.

- **Tabs** — clicking a file now reuses the clean preview tab instead of
  stacking a tab per file (editing or double-clicking keeps it); on the
  phone every file opens in the same tab. Both shells get an explicit "+"
  new-tab button — the phone's sits as a card where the new tab would go,
  browser-style — opening a landing page with new-note and open-file entry
  points. New-tab pages are never restored after a restart.
- **Media fix** — audio and video tabs play again: WebKitGTK/GStreamer and
  Android's webview could not stream the `asset://` scheme, so media now
  loads over IPC and plays from a `blob:` URL.
- **Shell navigation** — tab-activation Back/Forward in the title bar,
  menus and sheets kept out of phone navigation history.
- **Explorer** — native HTML5 drags (drag files out to a file manager, drag
  folders to move them), shared drag-session handling, edge-aware menus.
- **Interface size** — a setting plus Ctrl+=/-/0 zoom on desktop and mobile.
- **Under the hood** — a consolidation pass over the largest seams: the
  shell state hook and workspace lifecycle are split by concern; Markdown
  and code editors share one CodeMirror mount lifecycle; notes and text
  files share one native read/write path; extensions, themes and media all
  reuse the same workspace path containment; dead IPC commands, the legacy
  settings layer, and four unused dependencies are gone.
- **Sync** — credential-bearing URLs parse correctly when the password or
  path contains `@`; synced settings writes take the same lock as the
  renderer's.

## 0.3.0-2 — 2026-10-03

Prerelease for the conflict-merge UI, document version history, and file-history
adoption work merged since 0.3.0-1.

- **Merge and conflicts** — CodeMirror merge view with a slim two-bar chrome:
  resolution actions (Keep current / Use incoming / Keep both files) and an
  Inline / Side-by-side toggle on the merge bar, shared Undo / Redo / Save in
  the header for every editor, a help popover replacing the persistent
  explainer, and a tab error boundary so a tab crash no longer blanks the app.
- **Version history** — document history view with inline compare, restore
  previews, and adoption of an existing `.git` history into file history.
- **Workspace** — explorer drag-and-drop, new notes default to Markdown,
  shared backlinks inspector panel.
- **Mobile** — Journal added to New-note actions, workspace actions fixed on
  Android, journal accessibility gaps closed.

## 0.3.0-1 — 2026-09-20

Prerelease for the mobile navigation, file viewer, and sync work merged since
0.2.0.

- **Phone navigation** — browser-style Back/Forward history, breadcrumbs,
  action-items menu, New note popup, and hub-driven drawer and tab flows.
- **Workspace selector** — moved into the Explorer panel and shared across
  desktop and phone layouts.
- **File viewing** — generic file tabs, CodeEditor syntax highlighting, and
  filename titles where notes need them.
- **Sync and settings** — scheduled sync hardening, lifecycle-aware mobile
  triggers, advanced settings gating, and Android credential groundwork.
- **Extensions and IPC** — generated command/path registration keeps the Tauri
  contract in one place.

## 0.2.0 — 2026-08-27

Phone shell, overlay accessibility, platform capability gating, and settings polish.

- **Phone shell** — header with tabs and tab-switcher grid, drawer with
  scrim, bottom hub with long-press pin/remove, inspector sheet for all right
  panels. Popout goes full-bleed, hub hides while the soft keyboard is open,
  sync state moves to the header. Verified on Android.
- **Overlay accessibility** — Drawer, BottomSheet and Scrim with focus trap,
  escape handling, `role="dialog"` / `aria-modal`. InspectorSheet has ARIA
  tabs with keyboard navigation. Fixed slide animations (Tailwind v4 uses
  native CSS `translate`, not `transform`).
- **Platform capability gating** — `platform_capabilities` command reports
  what the current platform can serve (process spawning, keychain, folder
  picker). Commands whose required capability is absent show as unavailable
  in the palette rather than silently failing.
- **Shell mode switch** — Settings > Appearance > Shell layout: force phone
  or desktop chrome regardless of device, for quick UI testing.
- **Settings** — responsive header bar with slide-in nav and fuzzy search;
  phone hub editor with long-press pin/remove.
- **Themes** — forest-gray and pastel-pink presets.
- **Android** — managed vault access, CI pipeline for AAB + APK.

### Known limits

- **Binaries are not code-signed.** macOS and Windows will both warn that the
  developer is unidentified.
- **Search results are capped** at 200 matches, and nothing says so when a
  query matches more.
- **Installing an update restarts the app** without checking for unsaved edits.
  Save before accepting one.

## 0.1.0 — 2026-08-16

First release.

A local-first Markdown workspace: your notes stay ordinary `.md` files on disk,
and everything the app builds on top of them — the search index, the link graph,
the calendar — is a cache it can throw away and rebuild.

- **Editor** — CodeMirror with live preview, wiki-link autocomplete and
  navigation, vault-relative images. Writes refuse to overwrite a file that
  changed underneath them.
- **Explorer** — file tree with full CRUD, multi-window workspaces, and a native
  watcher that keeps the tree, the open tabs and the index in step with edits
  made outside the app.
- **Search** — full-text search over the vault or one folder, plus typed filters
  over frontmatter fields.
- **Journal and calendar** — dated entries as plain notes, filterable by what
  they record.
- **Themes and settings** — importable themes; searchable settings with
  validation, import/export and per-section reset.
- **Extensions** — load one from a local directory; it can contribute panels,
  editor headers and commands.
- **Updates** — the app checks once at launch and offers to install a newer
  version. Updates are signed, and only one signed by this project's key is
  accepted.

### Known limits

- **Binaries are not code-signed.** macOS and Windows will both warn that the
  developer is unidentified. This is separate from update signing above, which
  proves an update came from this project but says nothing to the OS.
- **Windows is untested.** The file watcher has been exercised by hand on Linux
  and macOS only; CI builds Linux alone.
- **Search results are capped** at 200 matches, and nothing says so when a query
  matches more.
- **Installing an update restarts the app** without checking for unsaved edits.
  Save before accepting one.
