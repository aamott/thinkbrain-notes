- name: `searchService.ts` and `wikiLinkIndexStore.ts` both `read_markdown_file` + `parseNote` per note — the read+parse half of indexing is duplicated
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/search/searchService.ts
- lines: 123-138, 204-221, 238-247, /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/wikiLinks/wikiLinkIndexStore.ts:88-109
- description: |
    `searchService.ts`:
      - `buildDocumentInput` (123-138): `parseNote(contents)` → map to `NativeDocumentInput`.
      - `indexWorkspace` (204-221): per file, `invokeNativeCommand("read_markdown_file", { rootPath, relativePath })` → `buildDocumentInput(...)`, with try/catch that logs and skips.
      - `indexDocument` (238-247): same read + `buildDocumentInput` for a single file.

    `wikiLinkIndexStore.ts`:
      - `readAndParse` (88-109): `invokeNativeCommand("read_markdown_file", { rootPath, relativePath })` → `parseNote(contents)`, with try/catch that logs and skips, plus an abort check after the read.

    The shared work: `read_markdown_file` IPC + `parseNote` + skip-on-failure. The differences:
      - search maps the parsed note to `NativeDocumentInput` (camelCase for serde); wiki-link keeps the `ParsedNote`.
      - wiki-link checks `signal?.aborted` after the read; search does not (search checks abort *between batches*, not per file).
      - search batches reads (50/batch); wiki-link does not (see `wiki-link-store-no-batching`).

    A shared `readAndParseNote(rootPath, relativePath, signal?)` helper in `native/` or `lib/` that returns `ParsedNote | null` (null = read/parse failed, logged) would deduplicate the read+parse+skip-on-failure logic. Both call sites would still do their own mapping (search → `NativeDocumentInput`, wiki-link → `WikiLinkIndexInput`). The abort-check difference would be unified (always check after read, which is strictly safer for search too).

    This is a real duplication (read + parse + skip-on-failure, two call sites with cosmetic differences) and the helper would be used twice with readable call sites. Estimated saving: ~10-12 lines net (the helper is ~8 lines, each call site drops from ~10 to ~3).

    Caveat: the helper belongs in a module both can import without a layering violation. `searchService.ts` is in `search/`, `wikiLinkIndexStore.ts` is in `wikiLinks/`. A neutral home is `native/` (it wraps a native command) or a new `lib/noteParsing.ts`. `native/` is the better fit since the core of the helper is the `read_markdown_file` IPC call.

    Recommended only if the team is comfortable with the cross-module import; otherwise the duplication is shallow and tolerable.
- verification: |
    `searchService.ts:204-221` and `wikiLinkIndexStore.ts:88-109` both do `invokeNativeCommand("read_markdown_file", ...)` → `parseNote(contents)` with try/catch + `console.warn("[..] Skipping .. during indexing:", error)` + return null.
    `searchService.ts:238-247` (`indexDocument`) repeats the same read+parse for a single file.
    `parseNote` is imported from `@thinkbrain/core` in both files (searchService.ts:1, wikiLinkIndexStore.ts:24).
    grep `read_markdown_file` → these two files plus the Rust side; no other TS caller.
- savings: ~10-12 lines net if a shared `readAndParseNote` helper is extracted to `native/`.
