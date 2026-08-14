- name: `parse_git_status_porcelain_v1` does not validate the index/worktree status characters
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/git.rs
- lines: 387-446
- description: The parser (lines 387-446) checks `bytes.len() < 4 || bytes[2] != b' '` (line 401) and that the path is non-empty (406), but it does not validate that `record[0..1]` and `record[1..2]` are legal porcelain v1 status codes. Any two bytes are accepted and propagated as `index_status`/`worktree_status`. The downstream `has_source_path` check (line 412) only looks for `R`/`C`, so an unexpected code (e.g. a corrupted record where the first two bytes are not status codes) will be silently treated as a non-rename and the bogus two-character string is sent to the frontend.

  This is a robustness gap, not an exploitable bug: the input comes from `git status --porcelain=v1 -z` which is machine-readable and stable, so a malformed record means either a git bug or a truncated stdout (which the NUL-split would surface differently). But the parser's stated contract is "Git returned an unexpected failure" for malformed input, and accepting arbitrary status bytes violates that. A small whitelist (`b" MARDRC?!U"` for both positions, plus `?` only valid when both are `?`) would make the parser fail loudly on garbage instead of forwarding it.

  Low urgency — the practical risk is near zero because git's porcelain output is well-formed — but worth noting alongside the existing `bytes.len() < 4` check which already validates structure.
- verification: read lines 387-446; no character whitelist for `record[0..1]`/`record[1..2]`. The `has_source_path` match (line 412) is the only validation of the status bytes.
