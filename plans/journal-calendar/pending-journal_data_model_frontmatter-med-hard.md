# Story: Journal Data Model & Markdown Frontmatter Contract

**Status:** pending · **Urgency:** med · **Difficulty:** hard

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Discovery constraints (approved 2026-08-07)

The discovery gate is CLOSED; full rationale and D1-D47 live in
`../pending-journal_discovery_and_wireframes-low-med.md`.

- **D2/D3:** entries are ordinary Markdown; metadata is a human-readable frontmatter block with self-describing keys, not codes/IDs.
- **D4:** fields are user-defined with only multi-select, single-select, number, and text inputs; no shipped mood/activity vocabulary.
- **D7/D17/D20:** writer emits `journal/YYYY/MM/YYYY-MM-DD-HHmm.md` under a configurable root, writes the date in filename/frontmatter, and filename wins without repair.
- **D21/D22:** no templates; new frontmatter contains only the date.
- **D30/D42:** read the approved narrow ISO forms; timed counters are `N >= 2`, never seconds or date-only counters; date-only sorts before timed entries.
- **D33/D38:** read leniently; filename date alone qualifies, malformed/absent frontmatter remains eligible and survives writes, and ambiguous dates are `UNDATED` without guessing.

**STOP gate:** The discovery gate above is closed. The following items remain OPEN and must not be silently resolved:

- Exact frontmatter date key, field-definition shape, invalid-data policy, and compatibility promise remain unsigned.
- Rename warnings and folder relocation policy remain open in the journal service story.

The filename parser is unblocked by D42. Do not implement frontmatter serializers or validators
for the remaining open field contract until the product owner signs it off. D45 already settles
definition drift: preserve existing values and surface removed ones as unconfigured.

## Goal

Define platform-agnostic journal metadata and a stable, portable Markdown contract that composes with the existing note parser. It preserves unknown frontmatter, follows D20/D33/D38 (filename wins, lenient read, ambiguity = UNDATED), and does not assume templates (D21) or pre-seeded fields (D22).

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

## Validation

- `packages/core` tests cover every approved format, ambiguous input (must return UNDATED), timed `-2`/`-3`, rejected `-1` and date-only counters, unknown-field round-trip, malformed/absent frontmatter, mismatch, and no-rewrite behavior; run `pnpm --filter @thinkbrain/core test`, `pnpm lint`, and `pnpm typecheck`.
- Desktop: open approved examples outside the app, edit an unknown field externally, and confirm explicit save preserves it without rewrite. Mobile/shared webview: run the pure parser fixtures and verify no desktop/native dependency.

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
