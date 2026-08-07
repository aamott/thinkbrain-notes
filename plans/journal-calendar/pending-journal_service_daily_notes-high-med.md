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

**STOP gate:** The discovery gate above is closed. The following items remain OPEN and must not be silently resolved:

- **Backfill mechanics and time component:** D19 allows backfill but the mechanics are undecided (what time is written to the filename when backfilling? midnight? user-supplied? current time?). Do not ship backfill without owner approval of the time component.
- **Folder creation on backfill:** when a backfilled entry falls into a past year/month folder that does not yet exist, should the service create it silently or prompt? Undecided.
- **Day-click when the popout is closed:** behavior when a calendar day is clicked and the popout is not open is undecided; this story does not need to resolve it but must not assume either path.
- **Error/retry copy:** exact error messages and retry behavior when the workspace is unavailable or a path is invalid are not yet approved.
- **Listing at scale (design question, unresolved):** D13 sets a target of thousands of
  entries and D9 requires each row to show the entry's first line. A naive recursive scan
  that opens every file to extract a first line does not hold at that size, and the popout
  opens on every activation. D16 makes the FTS5 index the likely source for previews and
  metadata filter values, but the split between "service walks the tree" and "service reads
  the index" is not decided. Decide it before implementing `listJournalEntries`; do not ship
  a full-scan-per-open implementation on the assumption it can be optimised later.

Do not implement backfill mechanics, folder-creation policy, or error copy until the owner approves them.

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

- Approved discovery/wireframes story (gate closed for D7–D33 above).
- Data-model story (approved `JournalEntryRef`, `parseJournalFilename`, `buildNewEntryFrontmatter`).
- Existing `WorkspaceDocumentApi`, `WorkspaceDesktopApi`, `loadWorkspaceDocument`, `saveWorkspaceDocument`, and native error shape.
- Existing frontmatter mutation policy (`created_at` at creation, `updated_at` on explicit save).

## Acceptance criteria

- [ ] Service accepts injected clock and workspace adapter dependencies for deterministic tests (D19).
- [ ] "New entry" always creates a new file; it never reopens or appends to an existing entry (D18).
- [ ] Same-minute collision is resolved by appending `-2`, `-3` counter; the service never overwrites an existing file (D30).
- [ ] New file contains date-only frontmatter; no fields are pre-seeded; no template content is applied (D21/D22).
- [ ] Opening or listing entries does not rewrite any file; unknown frontmatter survives (D20/D33).
- [ ] Folder and filename expansion uses only approved, path-safe tokens; traversal, empty names, and invalid extensions produce typed diagnostics, not silent failures.
- [ ] Backfill creates a file at the past date path; the time component is STOP-gated and must not be silently defaulted.
- [ ] Service is platform/UI agnostic at its boundary; no panel state, no direct Tauri calls.
- [ ] `listJournalEntries` accepts a bounded date range and its cost is documented against the
      thousands-of-entries target (D13); the tree-walk vs. index split is decided and recorded
      before implementation.
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
- Do not add a journal database or change generic workspace CRUD semantics.
- Do not silently default the time component of a backfilled entry (STOP-gated).

## Handoff artifacts

The next story (calendar data model) needs:

- `listJournalEntries(root, dateRange?)` — returns `JournalEntryRef[]` sorted by filename date; never rewrites files.
- `JournalEntryRef` with path, parsed date, UNDATED flag, diagnostic bag.
- Confirmed workspace adapter interfaces used (so calendar can reuse or mock them).
