# Story: Journal Data Model & Markdown Frontmatter Contract

**Status:** 🟨 implemented in `packages/core/src/journal/` (filename parser, entry comparator,
date resolution, field-definition validation, metadata reading) · **Urgency:** med ·
**Difficulty:** hard

Remaining: the unknown-field write round-trip, which needs the write path owned by
`pending-journal_service_daily_notes-high-med.md`.

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

**STOP gate — CLOSED.** The discovery gate above is closed, and the field-contract items this
story STOP-gated are now decided (`../pending-journal_discovery_and_wireframes-low-med.md`,
"Approved 2026-08-08 (D48-D70)"):

- **Frontmatter date key — closed by D48.** The key is `date`, a plain `YYYY-MM-DD` string with
  no time component; time lives in the filename only (D17), which wins on conflict (D20). `date`
  is reserved, alongside the note model's existing reserved keys (`title`, `tags`, `aliases`,
  `status`, `created_at`, `updated_at`); a user-defined field (D4) may not use any of them.
- **Field-definition shape — closed by D49.** See "Field-definition and value shapes (D49)" in
  Scope below.
- **Invalid-data policy — closed by D50.** Reading is lenient and never repairs. A value whose
  shape contradicts its declared type is kept verbatim on disk, shown as invalid with a
  non-blocking notice, and excluded from that field's facet values rather than coerced. Writes
  happen only on an explicit widget edit and touch only the changed keys; the current serializer
  may reflow YAML on such a write until
  `plans/note-model/pending-comment_preserving_frontmatter_roundtrips-low-hard.md` lands.
- **Compatibility promise — closed by D51.** The v1 stable contract is D42's filename table plus
  D48's `date` key. User-defined field keys are user-owned — never renamed, migrated, or
  garbage-collected. No schema-version marker is written into notes (D2). Reserving a further
  journal frontmatter key requires a new decision.

Rename warnings and folder-relocation policy were dropped, not decided — moving or renaming an
entry is ordinary file management under D2, out of scope for this story.

The filename parser is unblocked by D42. Implement the frontmatter serializers/validators against
D48-D51 above. D45 already settles definition drift: preserve existing values and surface removed
ones as unconfigured.

## Goal

Define platform-agnostic journal metadata and a stable, portable Markdown contract that composes with the existing note parser. It preserves unknown frontmatter, follows D20/D33/D38 (filename wins, lenient read, ambiguity = UNDATED), and does not assume templates (D21) or pre-seeded fields (D22).

## Scope

- Type definitions for journal date/ref, metadata, and path components.
- Filename parser: accepts exactly D42's three forms; returns `UNDATED` for every other form; validates dates/times and parses timed counters `N >= 2` without mistaking them for time.
- Frontmatter helpers: lenient read (D33), date-only write on create (D22), filename-wins resolution on conflict (D20), unknown field pass-through.
- **Field-definition and value shapes (D49).** A field definition is `{ id, label, type, options? }`.
  `id` is the literal frontmatter key, matching `^[a-z][a-z0-9_-]*$` and avoiding D48's reserved
  keys. `type` is one of D4's four input types (`text`, `single-select`, `number`,
  `multi-select`); `options` is required for `single-select`/`multi-select` and forbidden
  otherwise. Value shapes are fixed by type: `text` and `single-select` write a plain string,
  `number` a plain number, `multi-select` a flow list of strings. (Definitions themselves are
  stored as a single `string` setting with a custom control — owned by
  `pending-journal_settings_and_accessibility-med-med.md`; this story only consumes the shape
  for reading/validating values.)
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
- `plans/wip-note-model-low-hard.md` frontmatter mutation policy and comment-preserving follow-up remain binding.

## Acceptance criteria

- [x] The product-owner-approved D42 format table enumerates every accepted filename form and proves the year-first fixed-width forms unambiguous.
- [x] Parser returns `UNDATED` for every filename outside D42, including alternate separators, ISO `T`, month names, invalid dates/times, missing padding, and date-only counters.
- [x] Parser accepts timed counter suffixes `N >= 2`, rejects `-1`, and does not read the counter as part of the time component (D30/D42).
- [x] Date-only entries carry unknown time and sort before timed entries on the same day (D42).
- [x] A new-entry write emits frontmatter with the date field only; no other fields are pre-seeded (D22).
- [x] On read, filename date takes precedence over frontmatter date; the parser records the mismatch as a diagnostic but does NOT rewrite the file (D20).
- [x] Malformed YAML frontmatter does not disqualify an entry; the entry is surfaced with a diagnostic, not hidden (D33).
- [ ] Unknown frontmatter fields survive a round-trip through any journal write path (D33).
  *(No journal write path exists yet — `readJournalMetadata` keeps every unmatched key in
  `unconfigured`, and `pending-journal_service_daily_notes-high-med.md` owns proving the
  round-trip when it adds writes.)*
- [x] Types carry no hard-coded mood vocabulary or activity taxonomy; user-defined field values are represented as opaque strings/numbers (D4).
- [x] No template types or template application logic (D21).
- [x] Unit tests cover all D42 accepted/rejected examples, date-only ordering, counters 2/3, rejected counter 1, malformed YAML, absent frontmatter, unknown fields, date mismatch, and no-rewrite behavior.
- [x] Serialization is ordinary Markdown/YAML; no DB or workspace cache.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass on `packages/core`.

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
