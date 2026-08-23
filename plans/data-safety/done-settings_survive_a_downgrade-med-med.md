# Story: Settings Survive a Downgrade, and Corruption Is Recoverable

**Status:** ✅ complete · **Urgency:** medium · **Difficulty:** medium

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
- **A downgrade round-trip is lossless.** Both documents now carry the fields a
  newer build added: the app-settings document already preserved keys it did not
  recognize, and `desktopState` gained a `#[serde(flatten)]` extras map so Rust —
  which owns every production write to it — hands them along untouched. Neither
  document's version is stamped down any more, which only became safe once the
  unknown fields travelled with it: writing "version 5" over a v6 document would
  tell the next v6 build its own file had been migrated backwards and make it run
  that migration a second time.

- **Both readers of the app-settings document agree.** The registry-backed
  `parseDynamicAppSettings` and the legacy `parseAppSettings` were fixed
  together. The legacy one has no callers left in the repo but is exported from
  `@thinkbrain/core`, and leaving the old behaviour in it would have let anyone
  who wired it up reintroduce exactly the loss this story fixed.
- **An unparseable document is set aside before it is replaced.**
  `read_settings_file` moves it to `<stem>.corrupt.json` and reports nothing
  stored. One slot per document, overwritten, so repeated corruption cannot fill
  the disk. An empty file is not corruption — it stored nothing — so it is read
  as absent and leaves no quarantine behind.

## Acceptance criteria

- [x] A desktop-state document from a newer build keeps the workspace, tabs and
      panel layout this build understands, in both the TypeScript and Rust paths.
- [x] An app-settings document from a newer build keeps its settings, its
      unknown keys and its version — through both `parseDynamicAppSettings` and
      the legacy `parseAppSettings`.
- [x] A desktop-state document from a newer build survives a write by an older
      build with its unknown fields and its version intact.
- [x] A `version` that is not a non-negative integer still falls back to defaults.
- [x] An unparseable settings document is moved to `<stem>.corrupt.json` and the
      app starts with defaults rather than refusing to open.
- [x] An empty settings file is read as absent and quarantines nothing.
- [x] The user is told, in the app, that their settings were set aside.
      `quarantine_settings_file` records where it put the document — only once
      the move succeeded, since naming a path nothing was written to would be
      worse than saying nothing — and `useSettingsQuarantineAdapter` reads that
      once per window and pushes a notification.

      **Sticky**, unlike the sync producers. The file is recoverable only while
      the user knows it exists, and a toast that clears itself after eight
      seconds is how that goes unnoticed. Rare enough that ranking above the
      transient producers costs them nothing.

      The list is per-run rather than found on disk: the quarantine file
      survives until someone deals with it, and re-announcing it at every
      launch would nag about a loss already reported.

## Deliberately not in this story

- **TypeScript's `desktopState` reader still reports this build's version** and
  drops unknown fields when it rebuilds the record. It costs nothing today:
  Rust's `update_desktop_state` owns every write in the shipped app, and the
  TypeScript write path runs only for a caller-supplied gateway the app never
  uses. Mirroring it would widen `DesktopState.version` from a literal type and
  churn the expectations in a suite that has no bug to fix.
- **A recovery UI for settings.** The notification names the file and the app
  starts on defaults; offering to parse and merge a broken settings document is
  a different problem from restoring a note, and nobody has asked for it.
  `done-safe_writes_corruption_detection-med-hard.md` owns the note surface.
- **What corrupts the file in the first place.** Writes are already atomic
  (temp + rename in the same directory), so the writer is not the suspect. One
  candidate remains unexamined: `useWorkspaceLifecycle.ts` guards its debounced
  tab save on `stateRestored`, and a save that lands before restoration commits
  would persist an empty tab list. That would explain lost tabs, not a lost
  theme, so it is a separate thread.

## Validation of the closing change

- Two native tests: a quarantine is recorded with the path it was moved to, and
  an absent document is not reported as damage.
- Five frontend tests: silent on an ordinary launch, sticky when something was
  set aside, the path carried for copying, the count when several were, and
  quiet when it cannot ask.

## Validation

- `packages/core` — 348 tests; five new for the newer-document contract, across
  both the registry-backed and legacy readers.
- `apps/desktop` — 1095 tests; the desktop-state suite now asserts a newer
  document is read and a malformed version is not.
- `apps/desktop/src-tauri` — 115 tests; five new (newer document read, newer
  document written back, non-version version, quarantine, empty file).
  `cargo clippy --all-targets` is clean.
- Mutation-checked: removing the readable guard, dropping the version diagnostic
  from the parse result, skipping the quarantine rename, and stamping the version
  down — on either document — each fail a test.

## Verifying it by hand

Set `desktopState.version` in `~/.local/share/com.thinkbrain.notes/settings/app.json`
to `99`, add a key inside `desktopState` this build has never written, and launch.
The workspace, tabs and panel widths come back, and the added key is still there
after the app writes. Before this branch, all of it was gone.
