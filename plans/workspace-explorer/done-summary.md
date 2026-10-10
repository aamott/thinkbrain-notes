# Workspace Explorer — Completed Work

## File Watcher (explorer side)

Explorer tree and open editor tabs stay synchronized with external file
changes (VS Code edits, `git pull`, sync clients). The indexing-search epic
owns the Rust watcher lifecycle; this story owned the tree/editor UI
response.

- Tree refresh subscribes to note events and calls `refreshEntries`
  (coalesced) — chosen over patching `entries` from event payloads (events
  only describe Markdown files).
- `origin: "local" | "external"` on note events distinguishes self writes
  from external ones (absent = `"local"`).
- `StaleDocumentBanner` covers tabs with unsaved edits: non-modal,
  `role="status"`, one per affected tab; "Keep mine" only dismisses.
  Side-by-side compare deferred to `git-integration/inline_diff_viewer`.
- Fixed along the way: renaming a note left open tabs pointing at the old
  path; `retarget` now handles in-app and external renames.
- Blind-overwrite on save was closed by conflict-safe note writes (see
  `plans/indexing-search/done-summary.md`).

## FTS5 Search Integration — `fts5_search_backend`

Explorer search surfaces connect to the indexing-search FTS5 backend; no
second SQLite database or index lifecycle was added.

## Default Markdown Extension — `default_markdown_extension`

New note prefills a protected `.md` ending with the caret before it; removing
the extension prompts "Create a different file type?" with Keep editing as
the safe default. `.md`/`.markdown` accepted case-insensitively.

## Drag-and-Drop Move — `drag_and_drop_move`

Whole-row pointer drag with a floating preview; touch uses delayed
hold-to-drag; keyboard drive from the row handle cycles valid destinations.
Move = rename across directories via `rename_workspace_entry`, which returns
a `WorkspaceRenameResult` mapping every descendant's old→new path plus
Markdown classification — open tabs and note indexes retarget per file,
dirty contents survive. Native guards reject collisions, missing sources,
and descendant cycles before mutation.
