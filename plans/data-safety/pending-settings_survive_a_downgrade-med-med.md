# Story: Settings Survive a Downgrade, and Corruption Is Recoverable

**Status:** 🟨 in progress · **Urgency:** medium · **Difficulty:** medium

## Problem

From `user-noted-todo.md`: *"Occasionally during rebuilds, all saved settings are
lost. Workspace, theme, tabs, everything."*

Two ways the app threw away a settings document it could have read.

**A version it had not reached was treated as unreadable.** Both documents carry
a schema version, and both readers rejected anything higher than the build's own:
`readSettingsVersion` (app settings, `CURRENT_SETTINGS_VERSION`) returned an
error diagnostic and the caller fell back to defaults; `readVersionedDesktopState`
and its Rust twin returned `DEFAULT_DESKTOP_STATE`. The next write then replaced
the file, and the old values were gone for good.

Nothing exotic triggers this. `DESKTOP_STATE_VERSION` has been bumped five times;
running a branch that bumped it and then a branch that had not is an ordinary
afternoon here, and it cost the workspace, the open tabs and the panel layout
every time. That is the reported symptom exactly, and "during rebuilds" is what a
branch switch looks like from the outside.

**An unparseable document was overwritten in place.** Every reader — four of them
— falls back to defaults when the JSON will not parse, and nothing kept the bytes.
Whatever caused the corruption was then compounded by the app erasing the
evidence.

## What changed

- **A newer document is read, not discarded.** Every schema here is additive, so
  a document is readable in both directions: a field an older build never wrote
  falls back to its default, and one a newer build added is simply not read.
  `settings.version.unsupported` is now a warning that says what was actually
  true — newer, kept, not understood here — instead of an error claiming defaults
  were used. Only a `version` that is not a version at all still gives up, since
  then nothing can be said about the rest of the record.
- **The version is never stamped down** in the app-settings document. That
  document already preserves keys it does not recognize, so an older build can
  round-trip a newer one losing nothing; writing "version 1" over a v2 document
  would tell the next v2 build its own file had been migrated backwards and make
  it run the v2 migration a second time.
- **An unparseable document is set aside before it is replaced.**
  `read_settings_file` moves it to `<stem>.corrupt.json` and reports nothing
  stored. One slot per document, overwritten, so repeated corruption cannot fill
  the disk. An empty file is not corruption — it stored nothing — so it is read
  as absent and leaves no quarantine behind.

## Acceptance criteria

- [x] A desktop-state document from a newer build keeps the workspace, tabs and
      panel layout this build understands, in both the TypeScript and Rust paths.
- [x] An app-settings document from a newer build keeps its settings, its
      unknown keys and its version.
- [x] A `version` that is not a non-negative integer still falls back to defaults.
- [x] An unparseable settings document is moved to `<stem>.corrupt.json` and the
      app starts with defaults rather than refusing to open.
- [x] An empty settings file is read as absent and quarantines nothing.
- [ ] The user is told, in the app, that their settings were set aside — today it
      is only on stderr.

## Deliberately not in this story

- **Unknown-field passthrough for `desktopState`.** The app-settings document
  preserves keys it does not recognize; `desktopState` does not, because both
  `createDesktopState` and Rust's `create_desktop_state` build a fresh record.
  A downgrade round-trip therefore still drops fields only the newer build wrote
  — everything else survives, which is the difference between losing a feature's
  state and losing all of it. Closing the gap wants a `#[serde(flatten)]` extras
  map in Rust and a matching passthrough in TypeScript, and it is separable.
- **A recovery UI.** Surfacing a quarantined document, offering to restore it, and
  reporting what was detected belong to
  `pending-safe_writes_corruption_detection-med-hard.md`, which owns that surface
  for notes already.
- **What corrupts the file in the first place.** Writes are already atomic
  (temp + rename in the same directory), so the writer is not the suspect. One
  candidate remains unexamined: `useWorkspaceLifecycle.ts` guards its debounced
  tab save on `stateRestored`, and a save that lands before restoration commits
  would persist an empty tab list. That would explain lost tabs, not a lost
  theme, so it is a separate thread.

## Validation

- `packages/core` — 46 settings tests; three new for the newer-document contract.
- `apps/desktop` — 1095 tests; the desktop-state suite now asserts a newer
  document is read and a malformed version is not.
- `apps/desktop/src-tauri` — 114 tests; four new (newer document, non-version
  version, quarantine, empty file). `cargo clippy --all-targets` is clean.
- Mutation-checked: removing the readable guard, dropping the version diagnostic
  from the parse result, skipping the quarantine rename, and stamping the version
  down each fail a test.
