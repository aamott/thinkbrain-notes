# Story: Calendar Data Model & Journal Aggregation

**Status:** pending · **Urgency:** med · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Discovery constraints (approved 2026-08-07)

Discovery gate is CLOSED for items below. See `../pending-journal_discovery_and_wireframes-low-med.md` for the full decision log. Do not re-litigate these.

- **D4** Metadata fields are user-defined. No hard-coded mood colors, no hard-coded activity icons. The app ships NO vocabulary. Types must represent user-defined values as opaque strings/numbers.
- **D5** The calendar serves navigation, reflection, and metadata filtering in roughly equal
  measure — the model must support all three, not privilege one. (Separately, the epic's
  non-goals forbid emoji vocabulary and wellness/therapeutic framing.)
- **D8** Multiple entries per day. Metadata is per file. Per-day aggregation strategy is PROVISIONAL ("last one wins" is a placeholder) and is **this story's own decision to make** — the provisional value is not approved product behavior.
- **D14/D27** Full calendar opens as a canvas tab. Week and month views. First release shows a DOT ONLY.
- **D19** Local device time; no workspace timezone, no day-start offset.
- **D25** Clicking a day in the calendar **filters the popout list** to that day. It does not open an entry. Calendar and popout **share filter state**.
- **D29** One dot per entry, capped. Cap value and overflow treatment are **undecided**.
- **D33** Entry qualification: parseable date in filename only. Malformed frontmatter does not disqualify. Unknown frontmatter must survive. Calendar loading must not rewrite any file.
- **D36** Undated files form a pinned "Undated" group. Non-Markdown files are hidden. Non-Markdown and undated handling must be reflected in calendar day state.
- **D38** Ambiguous dates are UNDATED. The model must not guess.

**STOP gate:** The discovery gate above is closed. The following items remain OPEN and this story OWNS the decisions where marked:

- **Per-day aggregation (OWNED HERE):** D8's "last one wins" is a placeholder, not an answer. This story must propose and get approval for the aggregation strategy (e.g. "show all", "last one wins", "count only") before implementing it. Do not ship a default silently.
- **Dot cap and overflow (OPEN, not owned here):** D29 cap value and overflow treatment (e.g. `+N` badge, truncated row) are undecided. Implement the dot-per-entry structure with a configurable/injectable cap; leave overflow rendering to the UI story.
- **Day-click when the popout is closed:** behavior when a calendar day is clicked and the popout is not open is undecided. The model must expose the filter state; routing that state to a closed popout is out of scope here.
- **Date filter as a chip:** representation of the day filter as a chip in the popout UI is undecided; the model must expose a selected-day filter value without assuming chip UI.
- **Calendar tab singleton + option persistence:** undecided; not owned here.
- **Calendar grid keyboard model:** undecided; out of scope for the data model.

## Goal

Define a platform-agnostic calendar model and pure aggregation/query functions that derive day states from journal file lists. The model must support shared filter state between calendar and popout (D25), represent one dot per entry up to a cap (D29), expose user-defined metadata as opaque values (D4), and never rewrite files on load or filter (D33). Per-day aggregation strategy requires product-owner approval before implementation.

## Scope

- `CalendarDay` type: date identity, entry list (with refs), dot count (capped, cap injectable), metadata summary (opaque user-defined values), loading state, diagnostic bag.
- `CalendarFilter` type: selected day (nullable), active metadata filters. This is the shared state between calendar and popout (D25).
- Pure aggregation functions: derive `CalendarDay[]` from `JournalEntryRef[]` for a date range; UNDATED entries excluded from day cells, counted separately.
- Query helpers: filter entries by day, by metadata value.
- Day-state enum: no-entry, has-entries, undated-present, loading, error.
- No color assignments, no icon mappings, no vocabulary (D4).
- Fixture file: `plans/journal-calendar/assets/calendar-data-examples.md` with approved examples.

## Likely files

- `packages/core/src/journal/calendar.ts` — `CalendarDay`, `CalendarFilter`, `CalendarDayState`, aggregation and query functions.
- `packages/core/src/journal/calendar.test.ts` — deterministic fixtures; fixed clocks.
- `packages/core/src/journal/index.ts` and `packages/core/src/index.ts` — exports.
- `apps/desktop/src/journal/journalIndex.ts` — adapter/query orchestration only if needed; keep aggregation in `packages/core`.
- `apps/desktop/src/journal/journalIndex.test.ts` — if adapter is added.
- `plans/journal-calendar/assets/calendar-data-examples.md` — approved examples.

## Dependencies

- Approved discovery and journal frontmatter/data-model story.
- Journal service listing contract (`listJournalEntries` returning `JournalEntryRef[]`).
- Existing workspace file list and parser boundaries.
- FTS5/index cache is optional and rebuildable; calendar model must not treat it as source of truth.

## Acceptance criteria

- [ ] `CalendarDay` type distinguishes: no entry, one or more entries (with list), UNDATED presence, loading, and error states.
- [ ] Dot count per day is capped by an injectable parameter; the model does not hard-code the cap value (D29 cap undecided).
- [ ] Metadata summary fields carry opaque user-defined values; no mood vocabulary, no activity icons, no color tokens (D4).
- [ ] `CalendarFilter` carries a nullable selected-day and nullable metadata filters; calendar and popout consume the same type (D25).
- [ ] Per-day aggregation strategy is documented, product-owner-approved, and explicitly modeled — not silently defaulted from the D8 placeholder.
- [ ] Aggregation is deterministic for: empty range, single entry, multiple entries same day, malformed frontmatter (entry still counted), unknown field values, UNDATED entries (excluded from day cells).
- [ ] Calendar loading and filtering never rewrite any file (D33).
- [ ] Unknown frontmatter fields survive the aggregation pass (D33).
- [ ] Tests cover: month boundaries, leap years, timezone-fixed fixtures, multiple entries per day, malformed frontmatter, filters, empty ranges, dot-cap boundary, UNDATED exclusion.
- [ ] Model rebuilds correctly from a fresh `JournalEntryRef[]` with no app cache (D33).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass on `packages/core`.

## Tests / manual checks

- Core unit tests with fixed clocks and fixture notes for all acceptance criteria above.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Manual: compare aggregated fixture set with files on disk; delete/recreate one note; verify result changes only from the file set; confirm no file is rewritten by loading or filtering.

## Automated validation

`pnpm lint`, `pnpm typecheck`, `pnpm test` on focused core aggregation/query fixtures.

## Manual desktop/mobile checks

Desktop: compare aggregation with Markdown fixtures; delete/recreate notes; verify loading/filtering never rewrites files. Mobile/shared webview: run the same deterministic fixtures; verify no SQLite/native desktop dependency.

## Non-goals

- No calendar React component, visual encoding (colors, icons, emoji), settings UI, native watcher, reminder system, or extension registration.
- Do not choose a mood scale, activity color palette, hard-coded activity icons, or default filter (D4).
- Do not hard-code the dot cap value (D29).
- Do not implement calendar tab singleton or grid keyboard model (undecided).

## Handoff artifacts

The next story (calendar UI / popout filter integration) needs:

- `CalendarDay` and `CalendarDay[]` types with dot count and opaque metadata summary.
- `CalendarFilter` type — shared state shape for calendar and popout.
- `aggregateCalendarDays(entries, range, cap)` — pure function.
- `filterEntriesByDay(entries, day)` — returns `JournalEntryRef[]`.
- Approved per-day aggregation strategy (product-owner sign-off document).
- Approved `plans/journal-calendar/assets/calendar-data-examples.md`.
