- name: Explorer-created markdown files are not indexed in search/wiki-link indexes (inconsistent event emission across workspace CRUD adapters)
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/workspace/workspaceAdapter.ts
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/workspace/workspaceDocumentAdapter.ts
- lines: workspaceAdapter.ts 46-75; workspaceDocumentAdapter.ts 59-86
- description: `workspaceAdapter.createWorkspaceFile` does NOT emit a `note.created` event when a file is created. The search index and wiki-link index both subscribe to `note.created` events (via `subscribeIndexToNoteEvents` in `events/noteIndexSubscription.ts`) to incrementally update their caches. Without this event, a markdown file created via the explorer's "New file" action appears in the tree and command palette (via `handleMarkdownFileCreated` callback) but is NOT searchable and NOT resolvable in wiki-links until a workspace reopen or full rescan.

  Contrast with `workspaceDocumentAdapter.createMarkdownDocument` (workspaceDocumentAdapter.ts line 76-84), which DOES emit `note.created` and is documented as "the one place that can emit `note.saved` and `note.created` without any path being missed." The explorer bypasses this adapter by calling `workspaceAdapter.createWorkspaceFile` directly (WorkspaceExplorer.tsx line 302).

  Additionally, the native file watcher (`workspaceWatcher.ts`) explicitly drops echoes of the app's own writes ("The native side already drops the echoes of the app's own writes"), so the watcher will NOT emit a compensating `note.created` event for the explorer-created file.

  The `renameWorkspaceEntry` and `deleteWorkspaceEntry` methods in the same adapter DO emit `note.renamed` and `note.deleted` respectively (lines 68, 73), making `createWorkspaceFile` the only CRUD gap.

  This is also an architectural inconsistency: event emission for workspace file operations is split across two adapters with no clear ownership. `workspaceDocumentAdapter.ts` was designed to be the single event emission point (per its header comment), but `workspaceAdapter` took over rename/delete/create events for non-document operations. The rename and delete paths in `workspaceAdapter` emit their own events directly, which is also inconsistent with the "one place" claim — but those events happen to be correct because rename/delete are not duplicated in the document adapter. The create path is the only one that is both inconsistent AND buggy.

  Full event emission comparison across the two adapters:
  **`workspaceAdapter.ts`** (explorer CRUD):
  - `openWorkspace` → emits `workspace.opened` (line 48)
  - `createWorkspaceFile` → emits **nothing** (line 60-62)
  - `createWorkspaceFolder` → emits **nothing** (line 63-65)
  - `renameWorkspaceEntry` → emits `note.renamed` (line 68)
  - `deleteWorkspaceEntry` → emits `note.deleted` (line 73)
  **`workspaceDocumentAdapter.ts`** (document read/write/create):
  - `readMarkdownDocument` → emits **nothing** (line 63-65)
  - `writeMarkdownDocument` → emits `note.saved` (line 73)
  - `createMarkdownDocument` → emits `note.created` (line 82)

  Fix options:
  1. Have `workspaceAdapter.createWorkspaceFile` emit `note.created` when the file has a markdown extension (the adapter would need to check the extension).
  2. Have the explorer call `workspaceDocumentApi.createMarkdownDocument` for markdown files instead of `workspaceAdapter.createWorkspaceFile`, routing through the document adapter that already emits the event.
  3. Have the explorer emit `note.created` via `appEvents.emit` after a successful markdown create in `runWithRefresh`.

  Option 2 is cleanest but requires the explorer to depend on the document adapter. Option 1 is simplest if the adapter can check extensions. Option 3 keeps the event emission in the explorer but adds a dependency on `appEvents`.

  Recommended resolution: either (a) consolidate all note event emission into `workspaceAdapter` (since it already handles rename/delete and is the only adapter the explorer uses), adding `note.created` emission to `createWorkspaceFile` for markdown files, or (b) route explorer markdown creates through `workspaceDocumentAdapter.createMarkdownDocument` to honor the original design. Option (a) is simpler and matches the existing pattern in `workspaceAdapter`.

- verification: Read `workspaceAdapter.ts` (lines 60-62 — no event emission), `workspaceDocumentAdapter.ts` (lines 76-84 — emits `note.created`), `WorkspaceExplorer.tsx` `submitCreate` (lines 279-311 — calls `apiRef.current.createWorkspaceFile`), `noteIndexSubscription.ts` (subscribes to `note.created`), and `workspaceWatcher.ts` (line 16 — drops app echoes). Confirmed the gap. Read both adapter files in full and compared event emissions for each CRUD method; confirmed `workspaceDocumentAdapter.ts` header comment claims single ownership of `note.saved`/`note.created` (lines 51-58).
