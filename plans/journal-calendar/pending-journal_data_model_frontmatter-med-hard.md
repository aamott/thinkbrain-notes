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
- **D38** Ambiguous dates (e.g. `01-02-2026`) are treated as UNDATED. The app NEVER guesses. Every accepted filename format must be provably unambiguous.

**STOP gate:** The discovery gate above is closed. The following items remain OPEN and must not be silently resolved:

- Field definition drift and orphaned metadata (what happens when a user removes a field definition?).
- Rename warnings and folder relocation policy.
- Exact accepted filename formats have not been enumerated and signed off — do not ship the parser until a written format table is approved and every entry in it is proven unambiguous.

Do not add types, serializers, validators, or fixtures for open items until the product owner signs off the written field table, format table, invalid-data policy, and compatibility promise.

## Goal

Define platform-agnostic journal metadata and a stable Markdown contract that composes with the existing note parser while preserving unknown frontmatter and plain-file portability. The contract must be consistent with D20/D33/D38 (filename wins, lenient read, ambiguity = UNDATED) and must not assume templates (D21) or pre-seeded fields (D22).

## Scope

- Type definitions for journal date/ref, metadata, and path components.
- Filename parser: accepts an explicit, documented set of unambiguous formats; returns `UNDATED` for anything ambiguous or unrecognized (D38); optionally parses counter suffix (D30).
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

- [ ] A written, product-owner-approved format table enumerates every accepted filename date format and proves each is unambiguous; no entry that matches a format can be interpreted as two different dates (D38).
- [ ] Parser returns `UNDATED` (not an error, not a guess) for any filename that is ambiguous or does not match the approved format table (D38).
- [ ] Parser accepts an optional `-2`/`-3` counter suffix and does not read it as part of the time component (D30).
- [ ] A new-entry write emits frontmatter with the date field only; no other fields are pre-seeded (D22).
- [ ] On read, filename date takes precedence over frontmatter date; the parser records the mismatch as a diagnostic but does NOT rewrite the file (D20).
- [ ] Malformed YAML frontmatter does not disqualify an entry; the entry is surfaced with a diagnostic, not hidden (D33).
- [ ] Unknown frontmatter fields survive a round-trip through any journal write path (D33).
- [ ] Types carry no hard-coded mood vocabulary or activity taxonomy; user-defined field values are represented as opaque strings/numbers (D4).
- [ ] No template types or template application logic (D21).
- [ ] Unit tests cover: every approved format parsed correctly; every ambiguous input returns UNDATED; counter suffix 1/2/3; malformed YAML; absent frontmatter; unknown fields round-trip; filename/frontmatter mismatch diagnostic; no-rewrite behavior.
- [ ] Serialization is ordinary Markdown/YAML; no DB or workspace cache.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass on `packages/core`.

## Tests / manual checks

- `packages/core` unit tests for every approved format and every ambiguous input (must return UNDATED).
- Counter suffix tests: `-2`, `-3`, and absence.
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
- `parseJournalFilename(filename)` — approved format table, returns `JournalEntryRef | UNDATED`.
- `readJournalFrontmatter(rawYaml)` — lenient, returns parsed fields + unknown-field pass-through bag + diagnostics.
- `buildNewEntryFrontmatter(date)` — date-only write (D22).
- Exported accepted-format enum/constant set.
- Approved `plans/journal-calendar/assets/journal-frontmatter-examples.md` fixture file.
