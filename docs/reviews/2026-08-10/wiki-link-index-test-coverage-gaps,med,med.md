- name: Wiki-link index store tests miss concurrency, error, and dispose scenarios
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/wikiLinks/wikiLinkIndexStore.test.ts
- lines: 1-199
- description: The test file covers the happy path well (build, clear, incremental add/update, remove, rename, cross-workspace guard, one event-subscription test) but is missing several scenarios that the implementation's branching makes reachable:

  1. **Workspace switch during indexing** (lines 97-119): no test calls `indexWorkspace("/A", ...)` then `indexWorkspace("/B", ...)` before the first resolves and asserts that the final state reflects `/B` and not `/A`. The `get().rootPath !== rootPath` guard at line 109 is untested.
  2. **Read failure during `indexWorkspace`** (lines 83-89): `readAndParse` returns `null` and the file is skipped. No test configures `mockReadFile` to throw for one file and asserts the others are still indexed.
  3. **Read failure during `reindexDocument`/`reindexRenamedDocument`** (lines 132, 147): no test exercises the `parsed === null` early return. Given the rename-then-fail data-loss bug (see separate finding), this is a meaningful gap.
  4. **`indexWorkspace` catch block** (lines 113-118): no test forces `buildWikiLinkIndex` to throw (e.g. by making `parseNote` throw for *every* file so `inputs` is empty — though that path actually succeeds with an empty index; a real throw would need `invokeNativeCommand` to reject in a way that escapes `readAndParse`'s try/catch, which it can't since each read is wrapped). The catch is effectively unreachable given `readAndParse` swallows errors, so it may be dead code worth noting.
  5. **`subscribeToEvents` disposal** (lines 175-198): the test calls `dispose()` at the end but never emits an event *after* dispose to assert it's ignored. Also no test for double-`subscribeToEvents` (the leak scenario).
  6. **`note.renamed` event** is not exercised through `subscribeToEvents` — only `note.created` and `note.deleted` are emitted in the subscription test (lines 185, 193). The `reindexRenamedDocument` path is only tested via direct call (lines 142-159).
  7. **`selectBacklinks` selector** (lines 186-188 of the store) is never imported or asserted on in the test file.

- verification: Read the full test file (199 lines) and cross-referenced each branch in `wikiLinkIndexStore.ts` (lines 92-188). Confirmed no test invokes two concurrent `indexWorkspace` calls, no test makes `mockReadFile` throw, and the subscription test only covers `created`/`deleted` events.
