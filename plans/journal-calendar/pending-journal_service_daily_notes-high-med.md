# Story: Journal Service & Daily-Note Creation

**Status:** pending · **Urgency:** high · **Difficulty:** med

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

**STOP gate:** The discovery gate above is closed. The following items remain OPEN and must not be silently resolved:

- **Backfill mechanics and time component:** D19 allows backfill but the mechanics are undecided (what time is written to the filename when backfilling? midnight? user-supplied? current time?). Do not ship backfill without owner approval of the time component.
- **Folder creation on backfill:** when a backfilled entry falls into a past year/month folder that does not yet exist, should the service create it silently or prompt? Undecided.
- **Day-click when the popout is closed:** behavior when a calendar day is clicked and the popout is not open is undecided; this story does not need to resolve it but must not assume either path.
- **Error/retry copy:** exact error messages and retry behavior when the workspace is unavailable or a path is invalid are not yet approved.
- **Service adapter boundary:** choose `DesktopExtensionContext.workspace` or the existing workspace adapters before implementation; do not support both or couple the service directly to the host.

Do not implement backfill mechanics, folder-creation policy, or error copy until the owner approves them.

## Listing at scale — DECIDED

Resolved 2026-08-07 against the shipped index and D41. No new infrastructure is needed for listing or previews; metadata facets depend on the indexing-search story below. Dates, year/month grouping, Undated, calendar dots, and day filters derive from paths alone (D20), so each refresh uses one `list_workspace_entries` tree walk and no `read_markdown_file` calls for the list.

| Need | Source | Cost |
|---|---|---|
| Entry list, dates, grouping, Undated (D36), calendar dots (D29) | `list_workspace_entries` — paths only | one tree walk |
| First-line preview (D9) | `read_markdown_file`, **lazy per visible row**, memoised | ~20-40 reads, not thousands |
| Full-text search (D16) | existing `search_index(rootPath, query, limit)`, hits filtered to the journal root | already shipped |
| Metadata filter values (D16/D41) | platform index facet query | indexing dependency |

Because D13 virtualizes the list, fetch and memoise previews only for visible rows; do not prefetch the folder or block first paint (render the date first, then fill the preview). Delegate search to `search_index`, filtering hits to the journal root; if that is too coarse, add a native path-prefix argument through the indexing epic, not a journal-owned index. The disposable, rebuildable app FTS5 cache is never source of truth.

**Known caveat:** no file watcher exists yet (`plans/indexing-search/pending-file_watcher-low-med.md`), so externally-created files appear in the tree-walk list but not search until reindexing. State this in the UI.

### Metadata facets — platform dependency

D41 assigns structured-frontmatter facets to the platform-owned disposable index. This story may expose them through its UI-independent boundary but does not own the index schema or native command. Facets are blocked on `plans/indexing-search/pending-frontmatter_metadata_facets-high-hard.md`; listing, date filters, lazy previews, and search are not. If unavailable, return a typed unavailable result—never scan every file or create a journal cache.

## Goal

Implement a typed, UI-independent service that resolves dates/paths, detects same-minute collisions, and creates notes through the approved typed workspace boundary. Template application is deferred to a later increment (D21). Opening/listing must not rewrite files (D20/D33).

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
- [ ] Before backfill approval, only pure past-date path expansion is implemented/tested; file creation remains blocked on time and folder policy.
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
- Do not silently default the time component of a backfilled entry (STOP-gated).

## Handoff artifacts

The next story (calendar data model) needs:

- `listJournalEntries(root, dateRange?)` — returns `JournalEntryRef[]` sorted by filename date; never rewrites files.
- `JournalEntryRef` with path, parsed date, UNDATED flag, diagnostic bag.
- Confirmed workspace adapter interfaces used (so calendar can reuse or mock them).
