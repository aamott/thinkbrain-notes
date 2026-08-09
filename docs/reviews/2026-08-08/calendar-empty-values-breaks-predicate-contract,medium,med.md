- name: Calendar and panel disagree on entry values — calendar always passes empty values, breaking D25 shared-filter contract
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/CalendarTabContainer.tsx
- lines: 52-65
- description: |
    `CalendarTabContainer.read` maps each `JournalEntry` to a `CalendarEntry`
    with `values: {}`:
    ```ts
    return listing.entries.map((entry) => ({
      relativePath: entry.relativePath,
      ref: entry.ref,
      values: {}   // ← metadata never populated
    }));
    ```
    The comment says "Metadata filtering waits on the platform index (D41);
    until then the calendar counts entries." This is acceptable for dot counts
    today, but it creates a contract gap with the core calendar model:
    `aggregateCalendarDays` (`packages/core/src/journal/calendar.ts` lines
    119-128, 174-191) uses `entry.values` to evaluate `CalendarPredicate`s via
    `matchesPredicates` and to build per-day `values` summaries. Because every
    entry's `values` is `{}`, no predicate can ever match and every day's
    `values` summary is always empty — so when metadata predicates are wired in
    (the remaining work in `pending-calendar_tab_ui-high-hard.md`), the
    calendar will silently show zero matches for any metadata filter even on
    entries that plainly carry the field. The panel side
    (`JournalPanelContainer`) also passes `matchingPaths: null` and never
    supplies predicates, so the two surfaces agree today only because neither
    uses metadata. The moment predicates are introduced, the calendar's empty
    `values` will make it disagree with the panel.

    Separately, `JournalService.listEntries` (`journalService.ts` lines
    123-141) returns only `JournalEntry` (path + ref) and deliberately does not
    read frontmatter — so `CalendarTabContainer` has no source of values to
    populate even if it wanted to. Threading values in requires either reading
    frontmatter per entry in the container (the panel avoids this by design,
    D41) or waiting on the platform index. The empty-`values` mapping should at
    minimum be called out with a `TODO`/log that ties it to the D41 story so the
    contract gap is not forgotten when predicates land.
- verification: |
    Read `CalendarTabContainer.tsx` lines 55-61 (`values: {}` mapping). Read
    `calendar.ts` lines 119-128 (`matchesPredicates` reads
    `entry.values[predicate.field]`) and lines 174-191 (`summarise` iterates
    `entry.values`). Read `journalService.ts` lines 123-141 (`listEntries`
    returns `JournalEntry` with no values). Read
    `JournalPanelContainer.tsx` line 110 (`matchingPaths: null`). Confirmed
    both surfaces avoid metadata today, hiding the gap.
