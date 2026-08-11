# File Watcher for External Edits

## Goal

Detect changes to workspace Markdown files made outside the app (editor, sync
client, Git checkout) and update the search index incrementally so users do not
need to reopen the workspace to see external edits.

Today the index rebuilds fully on workspace open and updates only on in-app
create/save/rename/delete. A file watcher closes that gap.

Tracks open item OI-003. Matches the deferred file-watching plan in
`plans/wip-indexing-search-med-med.md`.

## Acceptance Criteria

- [ ] Workspace file changes (create, modify, delete, rename) made externally
      are reflected in the search index without reopening the workspace.
- [ ] Watcher debounces rapid event bursts (e.g. sync clients writing many
      files at once).
- [ ] App cache directories and dot-prefixed/hidden temp files are ignored.
- [ ] `.md` files are processed first; whitelisted attachment types only if
      needed for search.
- [ ] Indexing from the watcher never blocks the editor.
- [ ] Watcher is torn down cleanly on workspace close/switch (no leaked handles
      or stale events across workspaces).
- [ ] Works on the desktop target's supported OSes.

## Design

### Options considered

**A. Rust watcher → batched Tauri event → frontend re-emits the existing
`note.*` vocabulary.** (chosen) The watcher is a second *source* of events the
app already understands, so every existing consumer — search index, wiki-link
index, calendar — gains external-edit freshness without changing a line.

**B. Rust watcher → a new `workspace.filesChanged` event each consumer handles.**
Rejected. Three consumers today and more coming; each would grow its own copy of
dispatch logic that already exists for `note.*`. A special case layered beside
the mechanism instead of feeding it.

**C. Frontend polling (re-list and compare mtimes).** Rejected. No new crate, but
it trades latency against battery, costs an O(n) stat sweep per tick on large
vaults, and still misses a change-then-revert between ticks. Worse at the actual
goal.

**D. Rust owns indexing end to end (read, parse, write SQLite).** Rejected: it
contradicts the frontend-driven indexing decision (OI-005) and would fork
frontmatter parsing into a second implementation.

### Consequences of A

- **Self-write suppression is the feature, not an optimization.** The goal is
  changes made *outside* the app; an in-app save already reindexes through
  `note.saved`, so an unsuppressed echo means every save reindexes twice. All
  app writes funnel through the Rust markdown/workspace commands, which makes
  Rust the one choke point that can recognize its own echo — no bookkeeping has
  to cross the IPC boundary. Recorded per path as an expected-echo count with an
  expiry, consumed on match, so an external write to the same path is not
  blanket-suppressed by a time window.
- **Relevance filtering reuses `is_markdown_path`, `is_hidden_name` and
  `IGNORED_FOLDERS`.** One definition of "a note we care about", not two.
- **The OS-touching layer stays thin.** Event classification, path relevance and
  the echo registry are pure functions tested directly; only the watcher's setup
  and teardown need a tempdir.
- **Watchers are keyed by workspace root, refcounted by the window labels that
  asked.** Two windows on one vault share a watcher and both get the event;
  events carry `rootPath` and each window filters on its own.
- **This is the app's first Rust→frontend push.** Nothing in the frontend has
  used `@tauri-apps/api/event` before, so the listener is new surface area and
  gets its own translation module rather than being inlined into a store.

### Prerequisite refactor

`searchIndexStore.subscribeToEvents` and `wikiLinkIndexStore.subscribeToEvents`
are structurally identical: the same four events dispatched onto the same
`reindexDocument` / `removeDocument` / `reindexRenamedDocument` triple behind the
same `rootPath` guard. Extracted to one helper before the watcher lands, so the
frontmatter-facet index (the next story) inherits it instead of adding a third
copy. Not a blocker for the watcher — a compaction taken while the area is open.

## References

- `apps/desktop/src-tauri/src/commands/search.rs` — native index commands,
  `open_index_connection`, and FTS5 update helpers
- `apps/desktop/src/native/commands.ts` — frontend command bridge to add for
  index updates and search
- `apps/desktop/src/search/SearchPanel.tsx` and `searchPanelModel.ts` — current
  search UI placeholder/state model
- `plans/wip-indexing-search-med-med.md` — file-watching ownership and
  requirements
