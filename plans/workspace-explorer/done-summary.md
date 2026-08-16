# Workspace Explorer Epic — Completed Work

One story shipped: native file watcher integration.

## File Watcher
Explorer tree and open editor tabs stay synchronized with external file changes (VS Code edits, `git pull`, sync clients). The indexing-search epic owns the Rust watcher lifecycle; this story owns the tree/editor UI response.

Design decisions:
- **Tree refresh**: subscribe to note events and call existing `refreshEntries` (coalesced) — reuses the in-app edit path, keeps folders/non-Markdown files/`showHidden` correct. Chosen over patching `entries` from event payloads (events only describe Markdown files) or a shared Zustand store (no gain).
- **Self vs external writes**: added `origin: "local" | "external"` to note events (absent = `"local"`). Chosen over disk-vs-buffer comparison (read on every save, can't see in-flight typing race) or a separate `note.changedExternally` event (doubles events, grows vocabulary for one consumer).
- **Prerequisite refactor**: extracted `subscribeToNoteChanges` in `events/` (was the 4th/5th copy of the same subscription) and `lib/debounce.ts` (was the 4th hand-rolled debounce).

Fixed along the way: renaming a note from the explorer left open tabs pointing at the old path; `retarget` now handles both in-app and external renames.

Scope split: Part 1 (tree refresh, reload unmodified tabs, re-point renamed tabs) and Part 2 (`StaleDocumentBanner` for tabs with unsaved edits) both landed. Banner is non-modal, `role="status"`, one per affected tab. "Keep mine" only dismisses — overwriting takes the same deliberate save it always did. Side-by-side compare deferred to `git-integration/pending-inline_diff_viewer-high-med.md`.

Out of scope, since closed: blind-overwrite on save — fixed by `indexing-search/done-conflict_safe_note_writes` (see that summary).
- `apps/desktop/src/workspace/WorkspaceExplorer.tsx` — tree refresh
- `apps/desktop/src/events/` — `subscribeToNoteChanges`
- `apps/desktop/src/lib/debounce.ts` — shared debounce
- `apps/desktop/src/shell/externalDocumentSync.ts` — `StaleDocumentBanner` wiring
