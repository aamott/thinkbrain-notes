- name: `reindexDocument`/`reindexRenamedDocument` silently drop notes on read failure with no error event
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/wikiLinks/wikiLinkIndexStore.ts
- lines: 129-153
- description: `readAndParse` (lines 73-90) returns `null` on any read/parse failure and logs a `console.warn`. In `indexWorkspace` (line 104) that is correct — a corrupt note is skipped during a full rebuild. But in `reindexDocument` (line 132) and `reindexRenamedDocument` (line 147), a `null` result causes an **early `return` with no state change**, which means:

  - On `note.saved` for a note that is currently in the index but whose file briefly became unreadable (e.g. an external sync tool had it locked), the index keeps the *stale* entry. The user's edit is not reflected, backlinks are wrong, and there is no signal to the UI that the index is stale. `searchIndexStore.reindexDocument` (lines 126-133) at least `console.error`s; here we only `console.warn` inside `readAndParse` and the caller swallows it.
  - On `note.renamed`, `reindexRenamedDocument` (lines 140-153) first does `removeNote` for the old path and commits that (line 144), *then* reads the new path. If the read fails (line 147), the note has already been removed from the index but never re-added — the note vanishes from the index even though it exists on disk. This is a data-loss bug in the index. The remove-then-read ordering is documented as intentional ("Remove the old path first so stale links are cleared") but the failure path is not handled: on read failure the old entry should be restored, or the remove should be deferred until after a successful read.

  Neither failure path is covered by tests. The test suite only exercises the happy path (lines 98-159).

- verification: Read `wikiLinkIndexStore.ts` lines 129-153 and `readAndParse` lines 73-90. Confirmed `reindexRenamedDocument` commits `afterRemove` at line 144 before the read at line 146, so a read failure leaves the index without the note. Searched `wikiLinkIndexStore.test.ts` for failure-path tests (none found — all `mockReadFile` calls return valid contents).
