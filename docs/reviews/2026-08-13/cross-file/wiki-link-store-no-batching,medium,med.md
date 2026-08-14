- name: `wikiLinkIndexStore.indexWorkspace` fires all file reads concurrently with no batching or abort-mid-read — large vaults can stall the UI
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/wikiLinks/wikiLinkIndexStore.ts
- lines: 132-165
- description: |
    `indexWorkspace` (132-165) does:
      `const read = await Promise.all(files.map((file) => readAndParse(rootPath, file.relative_path, controller.signal)));`

    This fires `files.length` concurrent `read_markdown_file` IPC calls — one per note. For a vault with thousands of notes, this launches thousands of concurrent IPC round-trips and `parseNote` calls. The sibling `searchService.indexWorkspace` (searchService.ts:184-236) deliberately batches (default 50 per `index_documents` call, line 11) and yields between batches (`await Promise.resolve()` at line 230) "to keep the UI responsive" (line 229 comment).

    The wiki-link store's `readAndParse` (88-109) does check `signal?.aborted` after the read (line 100), so a superseding workspace switch aborts correctly *between* the read and the parse. But all reads are already in flight by then — abort does not cancel the IPC calls themselves, it only drops their results.

    This is a real architectural asymmetry: the two index stores do the same job (read every note, parse, build an index) but the search store batches + yields while the wiki-link store fires everything at once. For small vaults it is fine; for large vaults the wiki-link index can saturate the IPC channel and block the UI on the parse step.

    Fix: mirror the search store's batching — process `files` in chunks of N (e.g. 50), `await Promise.all(chunk)` per chunk, check `signal.aborted` between chunks, and `await Promise.resolve()` to yield. The `buildWikiLinkIndex` call at line 153 already takes the full `inputs` list, so batching only changes the read phase, not the build phase.

    This is not a correctness bug (the result is right) and the abort guard prevents wrong-workspace commits, but it is a performance/scalability issue that diverges from the documented pattern in the sibling store.
- verification: |
    `wikiLinkIndexStore.ts:141-143` — `Promise.all(files.map(...))`, no batching.
    `searchService.ts:192-233` — explicit `for (let start = 0; ...; start += batchSize)` loop with `DEFAULT_BATCH_SIZE = 50` (line 11) and `await Promise.resolve()` yield (line 230).
    `readAndParse` (88-109) checks `signal?.aborted` at line 100, after the read — so abort drops results but does not cancel in-flight reads.
- savings: 0 lines (the fix adds a loop); the value is UI responsiveness on large vaults and parity with the search store.
