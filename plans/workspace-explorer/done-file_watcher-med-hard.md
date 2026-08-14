# Native File Watcher

**Status: done.** Kept until the follow-ups below are filed.

## Goal

Consume the external file-change events owned by indexing-search so the explorer
and open editor stay synchronized (for example after a VS Code edit or `git
pull`). This story owns tree/editor UI response, not watcher lifecycle or index
maintenance.

## Design

- The indexing-search epic owns the Rust watcher, event production, debouncing,
  teardown, and search-index updates.
- The frontend `workspaceExplorerModel`/`WorkspaceExplorer` consumes those events
  and refreshes tree state without requiring a full reload.
- If an open editor tab represents a file changed externally, prompt the user to
  reload it (or auto-reload if unmodified).

## Architecture comparison (2026-08-12)

### How the tree should learn about a change

The explorer holds a flat `entries` array for the whole workspace (no lazy
loading) and rebuilds the tree with a `useMemo`. Every in-app create, rename and
delete already refreshes it the same way: `runWithRefresh` re-lists the folder
through `listWorkspaceEntries` and dispatches `opened`.

- **A. Subscribe to note events, call the existing `refreshEntries`, coalesced.**
  Reuses the path in-app edits already take, so folders, non-Markdown files and
  the per-workspace `showHidden` preference stay correct for free. One native
  listing per burst.
- **B. Patch `entries` from the event payloads.** No I/O, but note events only
  describe Markdown files. A new folder, a PDF or a `.canvas` file produces no
  event, so the tree would be *partly* fresh — worse than uniformly stale — and
  it would have to synthesise entry fields the events do not carry.
- **C. Move `entries` into a shared Zustand store.** A real refactor for no gain
  here: the shell's list is Markdown-only and the explorer's is every entry.

**Chosen: A.** Smallest change, and correct for entries the events cannot name.

### Telling our own writes apart from someone else's

`note.saved` is emitted both by `writeMarkdownDocument` after an in-app save and
by the watcher for an outside edit. The editor must reload for the second and
must not for the first — re-reading the file we just wrote would overwrite
keystrokes typed while the write was in flight.

- **D. Add `origin: "local" | "external"` to the note events.** One optional
  field; absent means `"local"`, so a future emitter that forgets it costs
  freshness rather than data. Consumers that do not care ignore it.
- **E. Compare disk contents against the buffer.** No contract change, but a
  read on every save and it still cannot see the in-flight-typing race.
- **F. A separate `note.changedExternally` event.** Cleanest split, but the
  watcher would emit two events per outside edit and the vocabulary grows for
  one consumer.

**Chosen: D.**

### Prerequisite refactor

Three places now subscribe to the same four note events with the same root
guard: both index stores (already shared via `subscribeIndexToNoteEvents`), the
shell's `workspaceFiles` effect, and — with this story — the explorer and the
editor. That is the fourth and fifth copy. A single `subscribeToNoteChanges`
in `events/` is written first and the shell's effect moves onto it.

Likewise there is no shared debounce: `SearchPanel`, `autosaveScheduler` and
`tabModel` each hand-roll one. This story adds a `lib/debounce.ts` rather than a
fourth. Migrating the existing three is deliberately left out of scope.

## Acceptance Criteria

- [x] Explorer tree updates automatically on file add/delete/rename events from
      the indexing-search watcher.
- [x] Active editor tab reloads content if its file changes externally — every
      open tab, in fact, not only the one on screen. A tab with unsaved edits is
      asked about instead; see the scope split below.
- [x] Explorer ignores events for closed or superseded workspaces.
- [x] No second watcher, debounce loop, or FTS5/index update path is introduced
      in this epic.

## Fixed along the way

Renaming a note from the explorer left any tab showing it pointing at a path
nothing lived at, because a tab's identity is built from its file's path and
nothing re-pointed it. Saving that tab wrote the note back under its old name.
This predates the watcher and applied to in-app renames; following a rename is
the same work whichever program made it, so `retarget` handles both.

## Scope split

A tab with unsaved edits whose file changed underneath needs the user to choose
between the two versions, which is a new UI surface and needs a mockup signed
off before it is built. So this story lands in two parts:

1. **No new UI** — tree refresh, reload of a tab with no unsaved edits, and
   re-pointing a tab whose file was renamed outside the app.
2. **Gated on a mockup** — the prompt for a tab with unsaved edits.

Both parts have landed. Part 2 is the `StaleDocumentBanner`: non-modal, one per
affected tab, `role="status"` with a polite live region so a screen reader hears
it without the keyboard being taken away mid-sentence. "Keep mine" only
dismisses — overwriting the newer file takes the same deliberate save it always
took, rather than falling out of clearing a message. Saving the tab, or closing
it, settles the conflict too.

Rejected at sign-off: a modal like the unsaved-close dialog (takes the keyboard
for something the user did not do, and a `git pull` across several open notes
queues one per note), and an ambient tab mark plus status-bar count (quietest
signal for the loudest problem, and the amber dot would have to share the tab
with the unsaved-changes dot). Mockup: `assets/stale-tab-prompt-mockup.html`.

Deferred with the pick: no side-by-side compare button — it needs a diff view,
and `git-integration/pending-inline_diff_viewer-high-med.md` already plans one
worth reusing. And a silent reload says nothing at all, since a tab with no
unsaved edits was showing a copy of the file and now shows the file.

## Out of scope, and worth a story of its own

`write_markdown_file` overwrote blind — it took no `expected` precondition,
unlike the settings writes, which go through `documentChain`. So saving a tab
whose file changed underneath still overwrote the outside edit, whether or not
the tab was reloaded. Closing that needed a Rust change and belonged with the
conflict prompt, not here.

Since closed by `indexing-search/done-conflict_safe_note_writes-med-med.md`,
which also revised "Keep mine" above: it now re-reads the file and re-points the
tab's precondition at it, because dismissing alone would leave every subsequent
save refused against the version the user had just declined.
