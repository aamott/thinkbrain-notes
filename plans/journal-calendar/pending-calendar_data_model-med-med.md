# Story: Calendar Data Model & Journal Aggregation

**Status:** pending · **Urgency:** med · **Difficulty:** med

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Goal

Define a platform-agnostic calendar model and pure aggregation/query functions that derive day states from journal files and approved metadata, without making SQLite or UI state the source of truth.

## Questions first

- What is a calendar day when notes carry different timezone offsets or ambiguous dates?
- Which day states are needed (no note, note, multiple notes, invalid note, selected, filtered)?
- How should mood/activity be represented when there are multiple values or conflicting notes?
- Is a month grid the first view, and what range/query limits are acceptable offline?
- Which filters are required for the first release, and what does “show mood/activity by day” communicate accessibly?

**STOP gate:** Do not finalize calendar types, aggregation precedence, colors, icons, or filter semantics until the owner approves these questions and the data examples in the discovery checkpoint. A default visualization is not a decision.

## Likely files

- `packages/core/src/journal/calendar.ts` (new: calendar day/cell/filter/query types and pure aggregation).
- `packages/core/src/journal/calendar.test.ts` (new: deterministic fixtures).
- `packages/core/src/journal/index.ts` and `packages/core/src/index.ts` (exports).
- `apps/desktop/src/journal/journalIndex.ts` (new adapter/query orchestration only if needed; keep aggregation in core).
- `apps/desktop/src/journal/journalIndex.test.ts` (new, if adapter is added).
- `plans/journal-calendar/assets/calendar-data-examples.md` (new approved examples).

## Dependencies

- Approved discovery and journal frontmatter/data model.
- Journal service/listing contract; existing workspace file list and parser boundaries.
- Disposable FTS5/index cache remains optional and rebuildable; no calendar-specific source of truth is introduced.

## Acceptance criteria

- [ ] Calendar model distinguishes date identity, entry presence/count, metadata summary, diagnostics, and loading/error states.
- [ ] Aggregation is deterministic for missing, malformed, duplicate, multi-entry, and unknown mood/activity values.
- [ ] Queries support the approved date range and filters without binding core to React, DOM, Tauri, or SQLite.
- [ ] Metadata summaries do not claim sentiment or health meaning and expose unknown/unavailable values honestly.
- [ ] Tests cover month boundaries, leap years, timezone fixtures, multiple entries per day, invalid frontmatter, filters, and empty ranges.
- [ ] The model can be rebuilt from Markdown files and does not require an app cache to remain correct.

## Tests / manual checks

- Core unit tests with fixed clocks and fixture notes; run lint/typecheck/test.
- Manual: compare an aggregated fixture set with the files on disk, delete/recreate one note, and verify the result changes only from the file set.
- Confirm no file is rewritten by calendar loading or filtering.

## Automated validation

Run focused core aggregation/query fixtures, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

## Manual desktop/mobile checks

Desktop: compare aggregation with Markdown fixtures, delete/recreate notes, and verify loading/filtering never rewrites files. Mobile/shared webview: run the same deterministic fixtures and verify no SQLite/native desktop dependency.

## Non-goals

- No calendar React component, visual encoding, settings UI, native watcher, reminder system, or extension registration.
- Do not choose a mood scale, activity color palette, or default filter without the approved discovery record.
