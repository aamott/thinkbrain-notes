- name: rename/delete markdown file silently ignore search index removal errors
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/markdown.rs
- lines: 170, 196
- description: |
    `rename_markdown_file` (line 170) and `delete_markdown_file` (line 196) call
    `crate::commands::search::remove_index_document(app, root_path, relative_path)`
    via `let _ = ...`, discarding the result entirely. Per the project's "fail
    loudly" rule (AGENTS.md: "Fail loudly: log errors clearly and return typed
    results"), a failed index removal after a rename or delete leaves a stale search
    hit pointing at a path that no longer exists, with no log or diagnostic
    surfacing the failure. The rename/delete itself succeeds and returns, so the
    user sees a successful operation while the search index silently drifts.

    The fix should at minimum log the error (eprintln or tracing) so the stale-index
    condition is observable; ideally the index removal result is surfaced as a
    non-fatal diagnostic alongside the command result. The primary filesystem
    operation should still succeed — the index cleanup is secondary — but the
    failure must not be invisible.
- verification: |
    Read markdown.rs rename_markdown_file (lines 127-173) and delete_markdown_file
    (lines 176-199) and confirmed both use `let _ =` to discard the
    `remove_index_document` result with no logging or error propagation.
