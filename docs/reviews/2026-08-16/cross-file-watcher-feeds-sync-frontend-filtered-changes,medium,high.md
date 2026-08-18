- name: watcher feeds sync the same filtered changes as the frontend, so non-Markdown edits are never recorded
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/watcher.rs
- lines: 571-602 (spawn_debouncer closure), cross-ref registry.rs 96-124 (note_changes)
- description: |
    `spawn_debouncer`'s closure calls `registry::note_changes(&key, &handler_root, &changes)` with the SAME `changes` vector it later emits to the frontend via `workspace://changed`. That vector is produced by `collect_changes`, which only keeps changes that passed `is_watchable_path` (Markdown + non-ignored area) inside `classify_event`/`single`. So the sync engine only ever hears about Markdown-file changes in non-ignored folders.

    This is the supply side of the divergence recorded in
    `cross-file-recordable-notes-vs-watchable-paths-divergence,hard,high.md`:
    even if `bootstrap::recordable_notes` were narrowed to match the watcher,
    the converse problem would remain — the watcher's filter is shaped by the
    frontend's needs (the index/cache only cares about Markdown), but the sync
    engine has a different invariant (faithful vault history). Routing sync
    through the same filtered feed couples two layers with different
    requirements.

    If the decision from the divergence finding is "history should include
    attachments," then the watcher needs to produce a sync-specific change
    list that is wider than the frontend's Markdown-only list — e.g. classify
    twice (once for the frontend with `is_watchable_path`, once for sync with
    a broader `is_in_watched_area`-only filter), or have `classify_event`
    return the broader set and let each consumer filter. Today there is one
    `changes` vector shared by both consumers, so no such split is possible
    without a change here.
- verification: |
    Read `spawn_debouncer` (watcher.rs 571-602): confirmed a single `changes`
    `Vec<WorkspaceChange>` is passed to `registry::note_changes` and then
    moved into the `WorkspaceChangedPayload` emitted to the frontend.
    Read `collect_changes` (watcher.rs 628-663) and `classify_event`/`single`
    (watcher.rs 169-206): confirmed `single` filters through
    `is_watchable_path`, so non-Markdown and ignored-area changes never enter
    `changes` at all. Read `registry::note_changes` (registry.rs 96-124):
    confirmed it consumes that same vector unchanged (except for the rescan
    branch, which re-walks via `recordable_notes`).
