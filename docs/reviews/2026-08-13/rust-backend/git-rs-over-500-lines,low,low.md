- name: `git.rs` is 514 lines — over the 500-line preferred, and the parser/error helpers are a clean split
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/git.rs
- lines: 1-514
- description: AGENTS.md says "< 500 lines preferred." `git.rs` is 514 lines, just over. The file has three coherent sections that could split with low risk:
  1. **IPC commands + runner trait** (lines 1-188, ~190 lines): the `#[tauri::command]` wrappers, `GitRunner` trait, `SystemGitRunner`, `GitCommandOutput`, `GitRunError`.
  2. **Git operations** (lines 204-379, ~175 lines): `git_availability_with`, `detect_git_repository_with`, `initialize_git_repository_with`, `git_status_with`, `stage_git_files_with`, `unstage_git_files_with`, `update_git_index_with`.
  3. **Porcelain parser + error formatting** (lines 382-512, ~130 lines): `parse_git_status_porcelain_v1`, `git_status_parse_error`, `git_run_error`, `git_command_failed`, `non_empty_git_text`, `bounded_git_text`.

  The cleanest split is `commands/git/porcelain.rs` for section 3 (the parser + the `bounded_git_text`/`non_empty_git_text`/`git_command_failed`/`git_run_error` helpers it depends on). The parser is independently coherent — it is a pure function on a string — and `tests.rs` already tests it indirectly via `git_status_with`. Total tokens go down because the module docstring + `use` block shrink and the parser's helpers stop sharing a file with the runner trait.

  This is a *low-urgency* finding: 514 is only 14 over the preferred threshold and well under the 800 hard limit. Flag it for the next time the file is touched, not as a standalone refactor.
- verification: read git.rs in full (514 lines); section boundaries confirmed by reading the function list. AGENTS.md "< 500 lines preferred" rule.
