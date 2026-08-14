- name: requireRoot validates root inconsistently with normalizeRoot
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/journalService.ts
- lines: 102-114, 124-142, 173-188
- description: |
    `requireRoot` (line 103) does its own validation: it rejects empty strings
    and any segment equal to `..`, but it does NOT reject absolute paths
    (leading `/` or `C:\`) and does NOT call `normalizeRoot` from
    `packages/core/src/journal/paths.ts`. It returns the raw `configured` string.
    `listEntries` (line 125) feeds that raw string straight into
    `workspace.listNotes(folder)`.
    Meanwhile `createEntry` → `resolveNewEntryPath` (line 179) calls
    `normalizeRoot`, which strips leading/trailing slashes, normalizes
    backslashes to forward slashes, and rejects `..`.
    The two code paths therefore see different roots for the same setting:
    a configured root of `"journal\\"` or `"/journal"` lists from one form and
    writes to another. The workspace adapter likely sandboxes, so this is not a
    traversal escape, but the inconsistency can cause "I created an entry but
    the list doesn't show it" symptoms on roots with trailing slashes or
    backslashes (relevant on Windows).
- verification: |
    grep for `normalizeRoot` across `apps/desktop/src/journal` returns no
    matches — the helper exists in core but is not used by the service that
    owns root validation. `requireRoot` is the only gate for `listEntries`.
- fix: |
    Have `requireRoot` call `normalizeRoot` (catching its throw and converting
    to a `JournalError("invalid-root", ...)`) so list and create share one
    canonical root form.
