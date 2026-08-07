# Persist Local Extension Directories

## Status

⬜ Not implemented. Directories added through the Extensions panel load
correctly but are forgotten on restart.

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

- [ ] Added directories survive a restart.
- [ ] A removed directory is not reloaded.
- [ ] A directory that fails to load reports why and stays listed.
- [ ] Existing settings documents without the field still parse.

## Automated validation

- Rust tests for the new field's default, merge, and round-trip.
- Desktop tests for startup reload, including a failing directory.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Non-goals

No watcher, no packaging, no install-from-file.

## References

- `plans/extensions/done-extension_local_directory_loader-low-med.md`
- `docs/superpowers/specs/2026-08-06-extension-local-directory-loader-design.md`
