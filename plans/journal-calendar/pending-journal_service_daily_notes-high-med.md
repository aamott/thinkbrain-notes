# Story: Journal Service & Daily-Note Creation

**Status:** pending · **Urgency:** high · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Discovery constraints (approved 2026-08-07)

Discovery gate is CLOSED for items below. See `../pending-journal_discovery_and_wireframes-low-med.md` for the full decision log. Do not re-litigate these.

- **D7/D17** Default path `journal/YYYY/MM/YYYY-MM-DD-HHmm.md`. Journal root is configurable. Nesting bounded at year/month/day. Time always present.
- **D18** "New entry" ALWAYS creates a new file. Never reopens or appends to an existing file.
- **D19** Device local time. Backfill allowed. No workspace timezone, no day-start offset.
- **D20** Filename wins on date conflict. Service must not rewrite frontmatter on open.
- **D21** No templates in the first slice. Template application is explicitly OUT OF SCOPE for this story.
- **D22** A new entry contains frontmatter with the date only; fields are NOT pre-seeded.
- **D30** Same-minute collision → counter suffix `-2`, `-3`, never seconds. Service must detect collision, increment counter, and not overwrite.
- **D33** Opening or listing entries must NOT rewrite files. Unknown frontmatter survives.
- **D41** Metadata facet values come from the platform index; no journal-owned cache and no full-file-scan fallback.
- **D42** Listing accepts only the approved narrow ISO read table; date-only entries sort before timed entries on the same day. Creation still emits D17 only.
- **D43** Combined metadata predicates match within one entry; service/index results must not combine values from separate entries.

**STOP gate:** The discovery gate above is closed. The following items remain OPEN and must not be silently resolved:

- **Backfill mechanics and time component:** D19 allows backfill but the mechanics are undecided (what time is written to the filename when backfilling? midnight? user-supplied? current time?). Do not ship backfill without owner approval of the time component.
- **Folder creation on backfill:** when a backfilled entry falls into a past year/month folder that does not yet exist, should the service create it silently or prompt? Undecided.
- **Day-click when the popout is closed:** behavior when a calendar day is clicked and the popout is not open is undecided; this story does not need to resolve it but must not assume either path.
- **Error/retry copy:** exact error messages and retry behavior when the workspace is unavailable or a path is invalid are not yet approved.

Do not implement backfill mechanics, folder-creation policy, or error copy until the owner approves them.

## Listing at scale — DECIDED

Resolved 2026-08-07 against the shipped index and D41. Listing and previews need no new
infrastructure; metadata facets depend on the indexing-search story below.

**Nothing in the list requires reading file contents.** D20 makes the *filename*
authoritative for an entry's date, so dates, year/month grouping, the Undated group,
calendar dots and the day filter all derive from paths alone. One `list_workspace_entries`
tree walk per refresh; no `read_markdown_file` calls. This is the whole reason the
full-scan problem disappears.

| Need | Source | Cost |
|---|---|---|
| Entry list, dates, grouping, Undated (D36), calendar dots (D29) | `list_workspace_entries` — paths only | one tree walk |
| First-line preview (D9) | `read_markdown_file`, **lazy per visible row**, memoised | ~20-40 reads, not thousands |
| Full-text search (D16) | existing `search_index(rootPath, query, limit)`, hits filtered to the journal root | already shipped |
| Metadata filter values (D16/D41) | platform index facet query | indexing dependency |

**Previews are lazy because the list is virtualized.** D13 already requires
virtualization, so only the visible window is ever rendered — fetch previews for those rows
and cache them. Do not prefetch the whole folder, and do not block first paint on previews:
render the row with its date immediately and fill the preview when it arrives.

**Search delegates; it does not re-implement.** `search_index` is query-only and takes no
path filter, so filter the returned hits to paths under the journal root. If that proves
too coarse, the fix is a path-prefix argument on the native command — an indexing-epic
change, not a journal-owned index.

**Do not build a journal-owned search index.** The FTS5 cache is the app's one index, is
disposable and rebuildable, and is never the source of truth.

**Known caveat:** there is no file watcher yet
(`plans/indexing-search/pending-file_watcher-low-med.md`), so externally-created journal
files will not appear in search until the workspace is reindexed. The tree walk *does* see
them, so the list stays correct — only search lags. State this in the UI rather than
pretending otherwise.

### Metadata facets — platform dependency

D41 chooses the platform-owned disposable index for structured frontmatter and facet
queries. This story may expose the query through its UI-independent boundary, but it does
not own the index schema or native command. Metadata facets remain blocked on
`plans/indexing-search/pending-frontmatter_metadata_facets-high-hard.md`; listing, date
filters, lazy previews and search remain unblocked. If the index is unavailable, return a
typed unavailable result — never scan every file or create a journal cache.

## Goal

Implement a typed, UI-independent service that resolves a journal date, expands the approved folder/filename convention, detects same-minute collisions (counter suffix), and creates a new daily Markdown note through existing workspace adapters. Template application is deferred to a later increment (D21). Opening/listing must not rewrite files (D20/D33).

## Scope

- Path expansion using approved `YYYY/MM/YYYY-MM-DD-HHmm` template with configurable root (D7).
- Always-create semantics: new file every call, no open-existing (D18).
- Counter-suffix collision detection and increment (D30).
- Date-only frontmatter on create (D22).
- Lenient listing/opening that does not rewrite any file (D20/D33).
- Backfill entry point (accepts a past date) — path expansion only; time component and folder-creation policy are STOP-gated above.
- Typed diagnostics for path safety, collisions, workspace errors.

## Likely files

- `apps/desktop/src/journal/journalService.ts` — service facade over typed workspace adapters.
- `apps/desktop/src/journal/journalPath.ts` — pure path expansion helper; no template interpolation (D21).
- `apps/desktop/src/journal/journalService.test.ts`, `journalPath.test.ts` — unit tests.
- `apps/desktop/src/workspace/workspaceDocumentAdapter.ts` and `workspaceAdapter.ts` — consume existing APIs; extend typed interfaces only where a gap is proven.
- `apps/desktop/src/native/commands.ts` — only if a required typed native command is missing; no direct Tauri calls from core or UI layers.
- `packages/core/src/journal/types.ts` — from data-model story (`JournalEntryRef`, `parseJournalFilename`).

## Dependencies

- Approved discovery/wireframes story (gate closed for the listed decisions above).
- Data-model story (approved `JournalEntryRef`, `parseJournalFilename`, `buildNewEntryFrontmatter`).
- Existing `WorkspaceDocumentApi`, `WorkspaceDesktopApi`, `loadWorkspaceDocument`, `saveWorkspaceDocument`, and native error shape.
- Existing frontmatter mutation policy (`created_at` at creation, `updated_at` on explicit save).
- D41 metadata facets depend on `plans/indexing-search/pending-frontmatter_metadata_facets-high-hard.md`; other service work does not.

## Acceptance criteria

- [ ] Service accepts injected clock and workspace adapter dependencies for deterministic tests (D19).
- [ ] "New entry" always creates a new file; it never reopens or appends to an existing entry (D18).
- [ ] Same-minute collision is resolved by appending `-2`, `-3` counter; the service never overwrites an existing file (D30).
- [ ] New file contains date-only frontmatter; no fields are pre-seeded; no template content is applied (D21/D22).
- [ ] Opening or listing entries does not rewrite any file; unknown frontmatter survives (D20/D33).
- [ ] Folder and filename expansion uses only approved, path-safe tokens; traversal, empty names, and invalid extensions produce typed diagnostics, not silent failures.
- [ ] Backfill creates a file at the past date path; the time component is STOP-gated and must not be silently defaulted.
- [ ] Service is platform/UI agnostic at its boundary; no panel state, no direct Tauri calls.
- [ ] `listJournalEntries` reads **no file contents** — dates come from filenames (D20); it
      applies D42 and sorts date-only before timed entries, and a 1,000-entry test asserts zero
      `read_markdown_file` calls.
- [ ] First-line previews are fetched lazily for visible rows only and memoised; a test
      asserts previews are not prefetched for off-screen entries.
- [ ] Metadata facet/filter queries delegate to D41, AND predicates within one entry per D43, return matching paths for D16 search-within-filter, and return typed unavailable state without scans or a journal cache.
- [ ] Tests cover: today's entry, same-minute collision (counter 2 and 3), past-date path expansion, invalid path segments, workspace unavailable, open/list no-rewrite, unknown frontmatter survival.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.

## Tests / manual checks

- Unit tests with injected clock: today's note, collision at minute boundary (counter 2 then 3), path traversal attempt.
- No-rewrite test: list/open an existing note; assert the file bytes are unchanged after the call.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test` / `./scripts/qa.sh`.
- Manual in a temporary workspace: create today's entry, create a second entry in the same minute (verify `-2` suffix), open an existing note (verify no rewrite), inspect files in a plain text editor after each operation.
- Verify listing/opening alone produces no file timestamp or content change.

## Automated validation

`pnpm lint`, `pnpm typecheck`, `pnpm test` or `./scripts/qa.sh` on focused service/path tests.

## Manual desktop/mobile checks

Desktop: temporary workspace, today/collision/past-date/invalid/error flows; inspect files externally after each. Mobile/shared webview: verify date/path behavior; verify no desktop-only native dependency; verify keyboard/suspension cancellation handles workspace-unavailable case.

## Non-goals

- No template application (D21) — explicitly deferred.
- No calendar aggregation, panel UI, mood/activity picker, settings UI, extension registration, reminders, or background watcher.
- Do not add a journal database, implement the platform index schema, or change generic workspace CRUD semantics.
- Do not silently default the time component of a backfilled entry (STOP-gated).

## Handoff artifacts

The next story (calendar data model) needs:

- `listJournalEntries(root, dateRange?)` — returns `JournalEntryRef[]` sorted by filename date; never rewrites files.
- `JournalEntryRef` with path, parsed date, UNDATED flag, diagnostic bag.
- Confirmed workspace adapter interfaces used (so calendar can reuse or mock them).
