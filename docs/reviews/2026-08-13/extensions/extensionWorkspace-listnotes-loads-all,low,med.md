- name: extensionWorkspace.listNotes loads all entries and filters client-side
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/extensionWorkspace.ts
- lines: 137-161
- description: |
    `listNotes(prefix?)` calls `entries.listWorkspaceEntries(root, false)` —
    which returns **every** entry in the workspace — then filters to markdown
    files whose `relative_path.startsWith(folder)` in JavaScript. For a workspace
    with thousands of notes this transfers and processes far more than the
    extension asked for. The native side already accepts a `pathPrefix` option
    for search (see `journal.tsx`'s `searchJournalEntries`), so the
    `listWorkspaceEntries` command could grow a prefix filter, or a dedicated
    `list_notes` command could accept a folder. Until then, an extension listing
    a small subfolder pays the cost of listing the whole vault on every call.

    This is a performance concern, not a correctness bug — the filtered result is
    correct (the `folder` prefix logic at lines 143-147 correctly excludes
    `journalish/` when asked for `journal`).
- verification: |
    Read lines 137-161. Confirmed `listWorkspaceEntries(root, false)` returns
    all entries and the filter is client-side. Checked
    `WorkspaceExplorer.tsx` (lines 134, 148, 263) which also calls
    `listWorkspaceEntries` with the full root. The native command signature
    (`workspaceAdapter.ts` line 12) takes only `(rootPath, includeHidden)` — no
    prefix parameter exists today.
- resolution: Deferred — high cost, low reward. Requires a Rust-side change to add a prefix filter to the `list_workspace_entries` Tauri command (and adapter signature), plus threading the option through. The current client-side filter is correct and only a perf concern for large vaults; not worth the cross-layer churn right now.
