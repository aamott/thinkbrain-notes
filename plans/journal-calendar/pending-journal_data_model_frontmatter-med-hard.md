# Story: Journal Data Model & Markdown Frontmatter Contract

**Status:** pending · **Urgency:** med · **Difficulty:** hard

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Discovery constraints (approved 2026-08-07)

Discovery gate is CLOSED for items below. See `../pending-journal_discovery_and_wireframes-low-med.md` for the full decision log. Do not re-litigate these.

- **D2** Entries are ordinary Markdown notes. No special format, no DB record.
- **D3** Metadata at the head of the file; human-legible, self-describing keys, no internal IDs or codes.
- **D4** Daily metadata fields are user-defined; four input types: multi-select, single-select, number, text. App ships NO mood scale and NO activity taxonomy.
- **D20** Date written to BOTH filename and frontmatter; **filename wins on conflict**. Parsing must NOT rewrite a disagreeing frontmatter date. Surfacing a mismatch is fine; silent repair is a defect.
- **D7/D17** The canonical WRITE format is `journal/YYYY/MM/YYYY-MM-DD-HHmm.md` with a
  configurable root; time is always present. This is the single format the writer emits —
  the accepted READ formats are a superset, enumerated in the approved format table.
- **D21** No templates in the first slice.
- **D22** A new entry contains frontmatter with the **date only**. Fields are NOT pre-seeded.
- **D30** Same-minute collision uses counter suffix `-2`, `-3`, never seconds. Parser must accept an optional counter and must not read it as time.
- **D33** The only requirement to be an entry is a parseable date in the filename. Read leniently, write one format. Frontmatter NOT required; malformed frontmatter does NOT disqualify an entry. Unknown frontmatter must survive read/write.
- **D38** Ambiguous dates (e.g. `01-02-2026`) are treated as UNDATED. The app NEVER guesses.
- **D42** Read formats are exactly the approved narrow ISO table in `assets/journal-frontmatter-examples.md`; date-only sorts before timed entries, and collision counters require `N >= 2`.

**STOP gate:** The discovery gate above is closed. The following items remain OPEN and must not be silently resolved:

- Exact frontmatter date key, field-definition shape, invalid-data policy, and compatibility promise remain unsigned.
- Rename warnings and folder relocation policy remain open in the journal service story.

The filename parser is unblocked by D42. Do not implement frontmatter serializers or validators
for the remaining open field contract until the product owner signs it off. D45 already settles
definition drift: preserve existing values and surface removed ones as unconfigured.

## Goal

Define platform-agnostic journal metadata and a stable Markdown contract that composes with the existing note parser while preserving unknown frontmatter and plain-file portability. The contract must be consistent with D20/D33/D38 (filename wins, lenient read, ambiguity = UNDATED) and must not assume templates (D21) or pre-seeded fields (D22).

## Scope

- Type definitions for journal date/ref, metadata, and path components.
- Filename parser: accepts exactly D42's three forms; returns `UNDATED` for every other form; validates dates/times and parses timed counters `N >= 2` without mistaking them for time.
- Frontmatter helpers: lenient read (D33), date-only write on create (D22), filename-wins resolution on conflict (D20), unknown field pass-through.
- Fixtures and unit tests covering every approved format, ambiguous inputs, counter suffixes, malformed YAML, absent frontmatter, and filename/frontmatter date mismatch.
- A signed-off format table artifact at `plans/journal-calendar/assets/journal-frontmatter-examples.md`.

## Likely files

- `packages/core/src/journal/types.ts` — journal date/ref, metadata, path component types. No templates (D21).
- `packages/core/src/journal/frontmatter.ts` — journal-specific normalization/validation helpers; reuse generic parser; never duplicate YAML parsing.
- `packages/core/src/journal/index.ts` and `packages/core/src/index.ts` — new exports.
- `packages/core/src/journal/types.test.ts` and `packages/core/src/journal/frontmatter.test.ts` — fixtures/tests.
- `packages/core/src/frontmatter.ts`, `packages/core/src/markdown.ts`, `packages/core/src/note-model.ts` — integration touch points only; preserve generic behavior.
- `plans/journal-calendar/assets/journal-frontmatter-examples.md` — approved examples including unknown fields, malformed YAML, ambiguous filenames, and counter suffixes.

## Dependencies

- Discovery/wireframes story approved (gate closed for D2–D38 above).
- Existing generic boundaries: `packages/core/src/frontmatter.ts`, `markdown.ts`, `note-model.ts`.
- `plans/technical-decisions.md` frontmatter mutation policy and comment-preserving follow-up remain binding.

## Acceptance criteria

- [x] The product-owner-approved D42 format table enumerates every accepted filename form and proves the year-first fixed-width forms unambiguous.
- [ ] Parser returns `UNDATED` for every filename outside D42, including alternate separators, ISO `T`, month names, invalid dates/times, missing padding, and date-only counters.
- [ ] Parser accepts timed counter suffixes `N >= 2`, rejects `-1`, and does not read the counter as part of the time component (D30/D42).
- [ ] Date-only entries carry unknown time and sort before timed entries on the same day (D42).
- [ ] A new-entry write emits frontmatter with the date field only; no other fields are pre-seeded (D22).
- [ ] On read, filename date takes precedence over frontmatter date; the parser records the mismatch as a diagnostic but does NOT rewrite the file (D20).
- [ ] Malformed YAML frontmatter does not disqualify an entry; the entry is surfaced with a diagnostic, not hidden (D33).
- [ ] Unknown frontmatter fields survive a round-trip through any journal write path (D33).
- [ ] Types carry no hard-coded mood vocabulary or activity taxonomy; user-defined field values are represented as opaque strings/numbers (D4).
- [ ] No template types or template application logic (D21).
- [ ] Unit tests cover all D42 accepted/rejected examples, date-only ordering, counters 2/3, rejected counter 1, malformed YAML, absent frontmatter, unknown fields, date mismatch, and no-rewrite behavior.
- [ ] Serialization is ordinary Markdown/YAML; no DB or workspace cache.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass on `packages/core`.

## Tests / manual checks

- `packages/core` unit tests for every approved format and every ambiguous input (must return UNDATED).
- Counter tests: timed `-2`/`-3` accepted; `-1` and date-only counters rejected.
- Unknown-field round-trip: read a note with unknown keys, write it, confirm keys survive.
- Run `pnpm --filter @thinkbrain/core test`, `pnpm lint`, `pnpm typecheck`.
- Manual: open approved examples in a plain text editor; edit an unknown field externally; confirm it survives an explicit journal update without being dropped or rewritten.

## Automated validation

`pnpm lint`, `pnpm typecheck`, `pnpm test` on `packages/core`.

## Manual desktop/mobile checks

Desktop: open approved examples outside the app; explicit save must preserve unknown fields without rewrite. Mobile/shared webview: run the same pure parser fixtures; verify no desktop/native dependency is introduced.

## Non-goals

- No service, calendar aggregation, UI, settings registration, extension host work, or migration of existing notes.
- No template types or template application (D21).
- Do not pre-seed fields on creation (D22).
- Do not rewrite frontmatter on open or index (D20/D33).
- Do not preserve frontmatter comments beyond the existing dedicated round-trip story unless that story is explicitly included as a dependency.

## Handoff artifacts

The next story (journal service) needs:

- `JournalEntryRef` type (date, counter, path, UNDATED flag).
- `parseJournalFilename(filename)` — D42 table, returns `JournalEntryRef | UNDATED` with unknown time for date-only entries and a stable date-only-before-timed comparator.
- `readJournalFrontmatter(rawYaml)` — lenient, returns parsed fields + unknown-field pass-through bag + diagnostics.
- `buildNewEntryFrontmatter(date)` — date-only write (D22).
- Exported accepted-format enum/constant set.
- Approved `plans/journal-calendar/assets/journal-frontmatter-examples.md` fixture file.
