- name: `mod.rs` `app_command_handlers!` macro is a flat 38-entry list — adding a command requires editing both the macro and the module
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/mod.rs
- lines: 30-77
- description: The `app_command_handlers!` macro (lines 30-77) is a flat list of 38 fully-qualified command paths inside `tauri::generate_handler![...]`. The docstring (lines 30-33) says it exists so "adding new commands to submodules does not require editing `lib.rs`" — true, but adding a command still requires editing *this* macro, in addition to the submodule. The macro does not discover commands; it is a manual registry.

  This is not strictly a compaction target (the macro is the shortest way to register Tauri handlers), but two observations:
  1. The macro could group commands by submodule with a comment header per group (workspace, git, markdown, search, settings, themes, extensions, watcher) to make the list scannable. Currently the commands are in roughly that order but with no separators — `desktop_shell_status` and `open_workspace` (workspace) are followed by 5 git commands, then `list_markdown_files`, then `list_workspace_entries` (workspace again), then more markdown. The interleaving makes it easy to misplace a new command.
  2. There is no compile-time check that every `#[tauri::command]` in the submodules appears in this list — a command added to a submodule but not registered here will silently fail to invoke from the frontend. Tauri does not warn at build time. A `#[cfg(test)]` test that greps for `#[tauri::command]` and asserts each appears in the macro would prevent this class of bug.

  Low urgency; flag for the next time a command is added. The grouping is cosmetic, the missing-test gap is the real risk.
- verification: read mod.rs:30-77; 38 entries, interleaved by submodule. Grepped `#[tauri::command]` across `commands/` — every command is in the macro, so no current drift, but nothing enforces it.
