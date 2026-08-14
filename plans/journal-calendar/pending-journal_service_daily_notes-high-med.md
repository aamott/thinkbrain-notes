# Story: Journal Service & Daily-Note Creation

**Status:** 🟨 core service implemented (`apps/desktop/src/journal/journalService.ts`,
path expansion in `packages/core/src/journal/paths.ts`) · **Urgency:** high · **Difficulty:** med

Remaining: lazy first-line previews, which wait on the panel story's list
virtualization (D13). Search delegation, settings wiring and panel wiring have
all landed; so have the D41 facets this story depended on.

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Discovery constraints (approved 2026-08-07)

The discovery gate is CLOSED; full rationale and D1-D47 live in
`../pending-journal_discovery_and_wireframes-low-med.md`.

- **D7/D17/D19:** configurable `journal/YYYY/MM/YYYY-MM-DD-HHmm.md` root/path, local device time, backfill allowed, no workspace timezone or day-start offset.
- **D18/D30:** every new entry is a new file; same-minute collisions use `-2`, `-3`, never overwrite, and never add seconds.
- **D20/D21/D22/D33:** filename wins; no templates; new frontmatter is date-only; open/list never rewrite files and unknown frontmatter survives.
- **D41/D43:** metadata facets come from the platform index (no journal cache/full scan); predicates match within one entry.
- **D42:** listing accepts only the narrow ISO table, date-only sorts first, and creation emits D17 only.

## STOP gate — CLOSED

Closed by D48-D70; full text in `../pending-journal_discovery_and_wireframes-low-med.md`.

- **Backfill mechanics and time — D61.** Date is backfilled; filename time is the current clock
  time; midnight is never fabricated.
- **Folder creation on backfill — D62.** Missing year/month folder is created silently.
- **Day-click when popout is closed — D59.** Opens the popout and applies the day filter (UI
  owned by panel/calendar stories).
- **Error/retry copy — D63.** Verbatim strings in Scope below.
- **Service adapter boundary — D68.** Via `DesktopExtensionContext.workspace`, extended with
  `listNotes(prefix)`.

## Listing at scale — DECIDED

Resolved 2026-08-07 against the shipped index and D41. No new infrastructure is needed for listing or previews; metadata facets depend on the indexing-search story below. Dates, year/month grouping, Undated, calendar dots, and day filters derive from paths alone (D20), so each refresh uses one `list_workspace_entries` tree walk and no `read_markdown_file` calls for the list.

| Need | Source | Cost |
|---|---|---|
| Entry list, dates, grouping, Undated (D36), calendar dots (D29) | `list_workspace_entries` — paths only | one tree walk |
| First-line preview (D9) | `read_markdown_file`, **lazy per visible row**, memoised | ~20-40 reads, not thousands |
| Full-text search (D16) | `search_index(rootPath, query, pathPrefix, limit)`, scoped to the journal root | already shipped |
| Metadata filter values (D16/D41) | platform index facet query | indexing dependency |

Because D13 virtualizes the list, fetch and memoise previews only for visible rows; do not prefetch the folder or block first paint (render the date first, then fill the preview). Delegate search to `search_index`, filtering hits to the journal root; if that is too coarse, add a native path-prefix argument through the indexing epic, not a journal-owned index. The disposable, rebuildable app FTS5 cache is never source of truth.

**Resolved 2026-08-11:** the native file watcher now reports outside changes as `note.*` events, so an externally-created entry reaches both the tree-walk list and search without reindexing by hand.

**Resolved 2026-08-13:** filtering hits to the journal root was too coarse, and
the escape hatch above was taken. `search_index` ranked and cut off the whole
vault before the panel filtered, so a query with plenty of matches outside the
journal returned few journal entries or none, silently — the more the user
wrote elsewhere, the worse journal search got. It now takes a `pathPrefix`,
applied in SQL beside the `MATCH`, sharing the metadata queries' definition of
a prefix. The panel asks for the native ceiling of 200 hits; a query matching
more entries than that still hides the rest, which is recorded under "Known
limits of search" in the indexing epic rather than fixed here.

### Metadata facets — platform dependency

D41 assigns structured-frontmatter facets to the platform-owned disposable index. This story may expose them through its UI-independent boundary but does not own the index schema or native command. If unavailable, return a typed unavailable result—never scan every file or create a journal cache.

**No longer blocked (2026-08-13):** `plans/indexing-search/done-frontmatter_metadata_facets-high-hard.md` shipped `query_index_metadata`, and `searchIndexStore.queryMetadata` returns the typed available/unavailable/failure results this asks for.

## Goal

Implement a typed, UI-independent service that resolves dates/paths, detects same-minute collisions, and creates notes through the approved typed workspace boundary. Template application is deferred to a later increment (D21). Opening/listing must not rewrite files (D20/D33).

## Scope

- Path expansion using approved `YYYY/MM/YYYY-MM-DD-HHmm` template with configurable root (D7).
- Always-create semantics: new file every call, no open-existing (D18).
- Counter-suffix collision detection and increment (D30).
- Date-only frontmatter on create (D22).
- Lenient listing/opening that does not rewrite any file (D20/D33).
- Backfill entry point (accepts a past date): resolves the path via D17 from the supplied date,
  stamps the filename with the current clock time (D61), and creates a missing year/month folder
  silently (D62).
- Typed diagnostics for path safety, collisions, workspace errors.
- **Error/retry copy — D63.** Approved copy, verbatim: journal folder unreadable —
  **"Can't read the journal folder."** with the path beneath and actions `Retry` / `Choose a
  different folder…`; no workspace open — **"Open a folder to start journaling."** with
  `Open folder…`; invalid journal root setting — **"The journal folder setting isn't a valid
  path."** with the offending value and `Open settings`. Errors name what failed and offer the
  fix; a raw error string is never the headline.

## Likely files

- `apps/desktop/src/journal/journalService.ts` — service facade over `DesktopExtensionContext.workspace`, not the workspace adapters directly (D68).
- `apps/desktop/src/journal/journalPath.ts` — pure path expansion helper; no template interpolation (D21).
- `apps/desktop/src/journal/journalService.test.ts`, `journalPath.test.ts` — unit tests.
- `apps/desktop/src/extensions/extensionWorkspace.ts` — add `listNotes(prefix)` to `DesktopExtensionWorkspace`, returning relative paths with modified times (D68); it wraps `workspaceDocumentAdapter.ts`/`workspaceAdapter.ts` internally, but the journal service does not call those adapters directly.
- `apps/desktop/src/native/commands.ts` — only if a required typed native command is missing; no direct Tauri calls from core or UI layers.
- `packages/core/src/journal/types.ts` — from data-model story (`JournalEntryRef`, `parseJournalFilename`).

## Dependencies

- Approved discovery/wireframes story (gate closed for the listed decisions above).
- Data-model story (approved `JournalEntryRef`, `parseJournalFilename`, `buildNewEntryFrontmatter`).
- Existing `WorkspaceDocumentApi`, `WorkspaceDesktopApi`, `loadWorkspaceDocument`, `saveWorkspaceDocument`, and native error shape.
- Existing frontmatter mutation policy (`created_at` at creation, `updated_at` on explicit save).
- D41 metadata facets depended on `plans/indexing-search/done-frontmatter_metadata_facets-high-hard.md`, which has shipped; other service work never did.

## Acceptance criteria

- [ ] Service accepts injected clock and workspace adapter dependencies for deterministic tests (D19).
- [ ] "New entry" always creates a new file; it never reopens or appends to an existing entry (D18).
- [ ] Same-minute collision is resolved by appending `-2`, `-3` counter; the service never overwrites an existing file (D30).
- [ ] New file contains date-only frontmatter; no fields are pre-seeded; no template content is applied (D21/D22).
- [ ] Opening or listing entries does not rewrite any file; unknown frontmatter survives (D20/D33).
- [ ] Folder and filename expansion uses only approved, path-safe tokens; traversal, empty names, and invalid extensions produce typed diagnostics, not silent failures.
- [ ] Backfill creates the file at the supplied past date: filename time is the current clock time (D61) and a missing year/month folder is created silently (D62); tests cover both.
- [ ] Service is platform/UI agnostic at its boundary; no panel state, no direct Tauri calls.
- [ ] `listJournalEntries` reads **no file contents** — dates come from filenames (D20); it
      applies D42 and sorts date-only before timed entries, and a 1,000-entry test asserts zero
      `read_markdown_file` calls.
- [ ] First-line previews are fetched lazily for visible rows only and memoised; a test
      asserts previews are not prefetched for off-screen entries.
- [ ] Metadata facet/filter queries delegate to D41, AND predicates within one entry per D43, return matching paths for D16 search-within-filter, and return typed unavailable state without scans or a journal cache.
- [ ] Tests cover: today's entry, same-minute collision (counter 2 and 3), past-date path expansion, invalid path segments, workspace unavailable, open/list no-rewrite, unknown frontmatter survival.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.

## Validation

- Focused tests cover the acceptance cases above, including injected-clock creation, collision counters 2/3, path traversal, no-rewrite bytes, lazy previews, 1,000-entry zero-read listing, facets, and typed unavailable results; run `pnpm lint`, `pnpm typecheck`, `pnpm test` or `./scripts/qa.sh`.
- Desktop: in a temporary workspace, create today's and same-minute entries, inspect `-2`, open/list without timestamp or content changes, exercise past-date/invalid/error flows, and inspect files externally. Mobile/shared webview: verify date/path behavior, no desktop-only native dependency, and keyboard/suspension cancellation for workspace-unavailable cases.

## Non-goals

- No template application (D21) — explicitly deferred.
- No calendar aggregation, panel UI, mood/activity picker, settings UI, extension registration, reminders, or background watcher.
- Do not add a journal database, implement the platform index schema, or change generic workspace CRUD semantics.
- Do not fabricate midnight or prompt the user for a time; the filename time component of a backfilled entry is always the current clock time (D61).

## Handoff artifacts

The next story (calendar data model) needs:

- `listJournalEntries(root, dateRange?)` — returns `JournalEntryRef[]` sorted by filename date; never rewrites files.
- `JournalEntryRef` with path, parsed date, UNDATED flag, diagnostic bag.
- Confirmed workspace adapter interfaces used (so calendar can reuse or mock them).
