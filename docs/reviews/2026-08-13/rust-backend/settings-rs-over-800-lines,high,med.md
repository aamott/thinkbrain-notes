- name: `settings.rs` is 829 lines — over the 800-line hard limit, and several helpers exist only for testability
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/settings.rs
- lines: 1-829 (whole file)
- description: AGENTS.md says "Never over 800 lines." `settings.rs` is 829 lines and is the largest Rust file in the backend. The file mixes four concerns that split cleanly along existing seams:
  1. **IPC commands + locks** (lines 101-269, ~170 lines): `read_app_settings`, `write_app_settings`, `update_desktop_state`, `update_app_theme`, `read_workspace_settings`, `write_workspace_settings` and the two precondition wrappers.
  2. **Path resolution** (lines 272-316, ~45 lines): `resolve_app_settings_path`, `resolve_workspace_settings_path`, `app_settings_path`, `workspace_settings_path`, `settings_dir`.
  3. **DesktopState model + (de)serialization** (lines 28-98, 319-772, ~520 lines): `DesktopState`, `DesktopStateUpdate`, `PersistedTab`, `CollapsedGroupsUpdate`, `WorkspaceViews`, and all the `apply_*` / `read_*` / `serialize_*` / `normalize_*` / `promote_*` / `merge_*` helpers.
  4. **File I/O** (lines 775-828, ~55 lines): `read_settings_file`, `write_settings_file` (atomic rename).

  The natural split is `commands/settings/state.rs` (concern 3, the model) and keeping the commands + I/O in `settings.rs`. The model is independently coherent (it has its own types, its own pure functions, and is the bulk of the file), and total tokens go down because the module docstring and the `use` block shrink. The pub helpers (`apply_desktop_state_update`, `serialize_desktop_state`, etc.) are `pub` for testability per `tests.rs` lines 1123-1326 — keep them `pub(super)` or `pub(crate)` and re-export from `settings.rs` so external callers and tests are unchanged.
- verification: read settings.rs in full (829 lines); confirmed via grep that the `pub` helpers are consumed in `tests.rs` (lines 1123-1326) and `desktopState.ts` (line 391, via the IPC boundary, not direct call). AGENTS.md "Never over 800 lines" rule.
