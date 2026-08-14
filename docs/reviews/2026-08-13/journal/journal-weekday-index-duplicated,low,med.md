- name: Weekday-index computation duplicated across 3 files
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/journalViewModel.ts, apps/desktop/src/journal/CalendarTab.tsx, apps/desktop/src/journal/MetadataWidget.tsx
- lines: journalViewModel.ts:90; CalendarTab.tsx:83,170,171; MetadataWidget.tsx:66,77
- description: |
    The pattern
      `WEEKDAYS[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()]`
    appears 5 times across 3 files (and a 6th variant in CalendarTab computes
    only the raw `getUTCDay()` for Home/End navigation). Each call reconstructs
    a UTC `Date` purely to read the weekday index. This is the same calendar
    arithmetic the core package already owns (`calendarGrid.ts` has `toUtc`/
    `fromUtc` helpers, but they are not exported).
    A single helper in core, e.g. `journalWeekday(date: JournalDate): number`
    (and optionally `journalWeekdayLabel`), would:
      - remove 5 copies of the `Date.UTC(...).getUTCDay()` incantation,
      - give the CalendarTab Home/End math a named base,
      - keep calendar arithmetic in the platform-agnostic layer where D19
        says it belongs.
- verification: |
    grep `new Date\(Date\.UTC\(` across `apps/desktop/src/journal` returns 7
    hits: 5 are the weekday-label pattern, 2 are CalendarTab Home/End index
    math. All resolve to the same UTC-from-JournalDate construction.
- fix: |
    Export `journalWeekday(date)` (returns 0-6) from
    `packages/core/src/journal/calendarGrid.ts` and use it in all 7 sites.
    Approx. 5-7 lines removed across the renderer, plus a single named
    source of truth for the weekday computation.
