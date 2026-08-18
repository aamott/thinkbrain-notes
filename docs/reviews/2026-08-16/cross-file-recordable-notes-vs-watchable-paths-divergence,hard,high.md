- name: bootstrap's recordable set diverges from the watcher's watchable set, splitting history
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/bootstrap.rs
- lines: 127-180 (recordable_notes/collect), cross-ref watcher.rs 137-152 (is_watchable_path/is_in_watched_area)
- description: |
    The first-snapshot walker and the incremental change feeder disagree on what
    is worth recording, so a vault's history is inconsistent across commits.

    `bootstrap::recordable_notes` (bootstrap.rs 127-180) records EVERY file whose
    name does not match `NEVER_RECORD`, recursing into EVERY directory. It does
    NOT call `workspace::is_ignored_entry_name`, so it walks into dotfiles
    (`.obsidian/`, `.trash/`) and the configured ignored folders
    (`node_modules`, `target`, `dist`, `vendor`). It also records non-Markdown
    files (images, PDFs, attachments).

    The watcher, by contrast, only reports a change when
    `is_watchable_path(root, path)` is true, which requires BOTH
    `is_markdown_path(path)` AND `is_in_watched_area(root, path)` — and the
    latter rejects any path component matching `is_ignored_entry_name`
    (dotfiles + `IGNORED_FOLDERS`).

    Consequences:
    1. The first snapshot (and every rescan, which re-calls `recordable_notes`
       via `registry::note_changes`) records `.obsidian/workspace.json`,
       `node_modules/.../index.js`, `attachment.png`, etc.
    2. Subsequent incremental commits — driven by the watcher — only ever
       report Markdown files outside ignored folders. So an edit to
       `attachment.png` or to a file inside `node_modules/` is never recorded
       by the watcher and the history entry goes stale forever.
    3. A rescan (folder delete, watcher error) re-reads the vault via
       `recordable_notes` and re-records those files, but rescans are rare and
       coarse — the file appears as "added back" in that commit even though it
       only ever changed silently between snapshots.
    4. A note moved INTO `node_modules/` is recorded once at the first
       snapshot, then the watcher stops seeing it; its history freezes.

    This is a design-level inconsistency, not a typo: the bootstrap doc says
    "every file worth recording" while the watcher is deliberately
    Markdown-only and ignored-folder-aware. The two policies need to be
    reconciled explicitly. Options:
      (a) Narrow `recordable_notes` to match the watcher: skip
          `is_ignored_entry_name` directories and (optionally) non-Markdown
          files. This keeps history and the watcher in lockstep but means
          attachments are never versioned.
      (b) Widen the watcher's sync feed: have `registry::note_changes` receive
          ALL file changes (not just Markdown) so attachments stay versioned,
          while the frontend's Markdown-only `workspace://changed` event keeps
          its current filter. This means the watcher's `classify_event`/`single`
          would need a sync-specific path filter separate from the frontend
          filter.
      (c) Accept the divergence and document it, but that means history is not
          a faithful record of the vault and restores will miss attachment
          edits — which undermines the "every resolution is undoable" goal.

    Whichever direction is chosen, `recordable_notes` should at minimum reuse
    `is_ignored_entry_name` for directory pruning so the first snapshot does
    not record `node_modules` and `target` trees (which can be enormous and
    are clearly not notes).
- verification: |
    Read `bootstrap.rs` `collect` (lines 134-180): confirmed it only checks
    `is_never_recorded(&name)` and `metadata.is_dir()`/`is_file()`, with no
    call to `is_ignored_entry_name` or `is_markdown_path`.
    Read `watcher.rs` `is_watchable_path` (lines 137-139) and
    `is_in_watched_area` (lines 147-152): confirmed the Markdown + ignored-name
    filter. Grep of `is_ignored_entry_name` confirmed it covers dotfiles and
    `IGNORED_FOLDERS = ["node_modules","target","dist","vendor"]`
    (workspace.rs lines 18-26). Read `registry::note_changes` (registry.rs
    lines 96-124): confirmed rescans route through
    `super::bootstrap::recordable_notes`, inheriting the same divergence.
