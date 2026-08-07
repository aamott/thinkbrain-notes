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
- **D8/D43** Multiple entries per day, metadata per file. Day summaries preserve all distinct per-field values; never choose a winner or calculate a synthetic daily value. Filters qualify a day only when one entry satisfies every active predicate.
- **D14/D27** Full calendar opens as a canvas tab. Week and month views. First release shows a DOT ONLY.
- **D19** Local device time; no workspace timezone, no day-start offset.
- **D25** Clicking a day in the calendar **filters the popout list** to that day. It does not open an entry. Calendar and popout **share filter state**.
- **D29/D46** Both views show up to three dots, then `+N`; accessible text retains the exact matching count. Active filters count only D43-matching entries.
- **D33** Entry qualification: parseable date in filename only. Malformed frontmatter does not disqualify. Unknown frontmatter must survive. Calendar loading must not rewrite any file.
- **D36** Undated files form a pinned "Undated" group. Non-Markdown files are hidden. Non-Markdown and undated handling must be reflected in calendar day state.
- **D38** Ambiguous dates are UNDATED. The model must not guess.

**STOP gate:** The discovery gate above is closed. The following items remain OPEN and this story OWNS the decisions where marked:

D43 and D46 close aggregation and entry-density policy. The remaining open items are UI routing/state questions:

- **Day-click when the popout is closed:** behavior when a calendar day is clicked and the popout is not open is undecided. The model must expose the filter state; routing that state to a closed popout is out of scope here.
- **Date filter as a chip:** representation of the day filter as a chip in the popout UI is undecided; the model must expose a selected-day filter value without assuming chip UI.
- **Calendar tab singleton + option persistence:** undecided; not owned here.
- **Calendar grid keyboard model:** undecided; out of scope for the data model.

## Goal

Define a platform-agnostic calendar model and pure aggregation/query functions that derive day states from journal entries. Preserve D43 distinct values and same-entry filter semantics, expose D46 exact/capped counts, share filter state with the popout (D25), and never rewrite files (D33).

## Scope

- `CalendarDay` type: date identity, entries, exact matching count, visible dot count capped at three, overflow count, distinct-value metadata summary, loading state, diagnostics.
- `CalendarFilter` type: selected day and active metadata predicates, shared by calendar and popout (D25).
- Pure aggregation: preserve distinct values across entries; exclude UNDATED entries from day cells and count them separately.
- Query helpers: AND active predicates within each entry, then derive qualifying days and D46 counts from matching entries only.
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
- D41 index queries provide matching paths at scale, but the pure model remains deterministic from entry fixtures and never treats the cache as source of truth.

## Acceptance criteria

- [ ] `CalendarDay` type distinguishes: no entry, one or more entries (with list), UNDATED presence, loading, and error states.
- [ ] Day state exposes exact matching count, visible dots `min(count, 3)`, and overflow `max(count - 3, 0)` for D46.
- [ ] Metadata summaries preserve all distinct opaque values per field; no latest-entry, averaging, vocabulary, icons, or color semantics (D4/D43).
- [ ] `CalendarFilter` carries selected day and metadata predicates; predicates are ANDed within each entry, and qualifying days/counts derive only from matching entries (D25/D43).
- [x] Per-day aggregation and density strategies are product-owner-approved in D43/D46 and recorded in `assets/calendar-data-examples.md`.
- [ ] Aggregation is deterministic for: empty range, single entry, multiple entries same day, malformed frontmatter (entry still counted), unknown field values, UNDATED entries (excluded from day cells).
- [ ] Calendar loading and filtering never rewrite any file (D33).
- [ ] Unknown frontmatter fields survive the aggregation pass (D33).
- [ ] Tests cover month boundaries, leap years, timezone fixtures, distinct multi-entry values, same-entry AND filters, empty ranges, counts 0/1/3/4/8, malformed frontmatter, and UNDATED exclusion.
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
- Do not replace D43/D46 with alternate aggregation or density rules.
- Do not implement calendar tab singleton or grid keyboard model (undecided).

## Handoff artifacts

The next story (calendar UI / popout filter integration) needs:

- `CalendarDay` and `CalendarDay[]` types with dot count and opaque metadata summary.
- `CalendarFilter` type — shared state shape for calendar and popout.
- `aggregateCalendarDays(entries, range, filters)` — pure D43/D46 aggregation with exact, visible-dot, and overflow counts.
- `filterEntriesByDay(entries, day)` — returns `JournalEntryRef[]`.
- Approved per-day aggregation strategy (product-owner sign-off document).
- Approved `plans/journal-calendar/assets/calendar-data-examples.md`.
