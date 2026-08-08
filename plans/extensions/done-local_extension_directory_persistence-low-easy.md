# Persist Local Extension Directories

## Status

✅ Done. `developmentExtensionDirectories` is stored in `desktopState`
(Rust + TS mirrors), `createLocalExtensions` persists on add/remove and
restores at startup via `restore()`, and a stored directory that fails to
load stays stored and reports its diagnostics in the Extensions panel.
Directories are deliberately not canonicalized so a temporarily missing one
is not silently dropped.

## Goal

Remember the development extension directories a user has added, and reload
them at startup. Deferred out of the loader story because it needs a new
`desktopState` field rather than any loader change.

## Implementation tasks

1. Add `developmentExtensionDirectories: string[]` to `DesktopState` and
   `DesktopStateUpdate` in `apps/desktop/src-tauri/src/commands/settings.rs`
   (`create_desktop_state`, `read_versioned_desktop_state`,
   `apply_desktop_state_update`, `serialize_desktop_state`) and mirror it in
   `apps/desktop/src/settings/desktopState.ts`.
2. Persist on add/remove through the existing `update_desktop_state` command.
3. Load stored directories after `bootstrapExtensions()` in `main.tsx`; a
   directory that no longer loads reports its diagnostics and is kept in the
   list so the user can fix it rather than silently losing the entry.

## Acceptance criteria

- [x] Added directories survive a restart.
- [x] A removed directory is not reloaded.
- [x] A directory that fails to load reports why and stays listed.
- [x] Existing settings documents without the field still parse.

## Automated validation

- Rust tests for the new field's default, merge, and round-trip.
- Desktop tests for startup reload, including a failing directory.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Non-goals

No watcher, no packaging, no install-from-file.

## References

- `plans/extensions/done-extension_local_directory_loader-low-med.md`
- `docs/superpowers/specs/2026-08-06-extension-local-directory-loader-design.md`
