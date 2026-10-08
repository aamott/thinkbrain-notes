# `fs:allow-read-text-file`/`fs:allow-write-text-file` are granted unscoped to every window

- **Urgency:** med
- **Difficulty:** med
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/capabilities/desktop.json`
- **Lines:** 17–19 (and `capabilities/mobile.json` lines 15–17)

## Description

Both capability files grant `fs:allow-read-text-file` and
`fs:allow-write-text-file` to `main` and `workspace-*` windows with no path
scope. `src/native/fs.ts`'s own header confirms the consequence: "the granted
capabilities carry no path scope, so these may only ever receive paths the
user just picked in a system open/save dialog" — an unenforced convention.
Any renderer code — a local extension (which runs same-realm with full app
privileges), a compromised dependency, or a future injection through a note —
can read or overwrite arbitrary text files (`~/.ssh/authorized_keys` is text).

Contrast with the app's own commands: `read_extension_file` canonicalizes and
confines to the extension dir, and the workspace commands confine to the
vault root. The plugin-fs path is the one remaining arbitrary file primitive.

## Recommendation

Two options, neither free:

- Move import/export behind scoped Rust commands that take a path the dialog
  plugin just produced (or return the path from the dialog in the same call),
  then drop the two `fs:allow-*` grants; or
- Keep the grants but add `fs:scope` entries so only plausible import/export
  locations are reachable.

The first is more work but matches the codebase's direction of keeping
path-bearing decisions behind Rust commands. Note `fs:default` (which stays)
already grants plugin basics scoped to app dirs.

## Verification

`capabilities/desktop.json:18-19`, `capabilities/mobile.json:17-18` grant the
two `fs:allow-*` permissions with no `scope` field; `tauri_plugin_fs::init()`
in `lib.rs:105` configures no scope. `src/native/fs.ts:11-17` documents the
missing scope. Callers: `settings/themeImportExport.ts`,
`settings/SettingsImportExport` paths originate from `pickFilePath`/
`saveFilePath`, so a Rust-side command could take the dialog result directly.
