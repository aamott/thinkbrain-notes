- name: calendarGrid computed twice with identical arguments
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/CalendarTabContainer.tsx, apps/desktop/src/journal/CalendarTab.tsx
- lines: CalendarTabContainer.tsx:134; CalendarTab.tsx:145
- description: |
    `CalendarTabContainer` calls
      `const grid = calendarGrid({ view, date: focusDate, weekStartsOn });`
    purely to read `grid.range` for `aggregateCalendarDays` (line 135).
    It then renders `<CalendarTab view={view} focusDate={focusDate} ... />`,
    and `CalendarTab` immediately re-runs the exact same call (line 145) to
    get `grid.days`/`grid.title`/`grid.month` for rendering.
    `calendarGrid` is pure and deterministic, so both calls return the same
    object — the work is simply done twice per render, and the two results
    are kept in sync only by the props happening to match.
- verification: |
    grep `calendarGrid\(` in the journal dir returns exactly the two call
    sites, both with `{ view, date: focusDate, weekStartsOn }`. The container
    needs only `grid.range`; the tab needs the full grid.
- fix: |
    Compute `grid` once in the container and pass it to `CalendarTab` as a
    prop (the tab already accepts `view`/`focusDate`/`weekStartsOn`, which are
    just the inputs to `calendarGrid`). Removes one recomputation per render
    and makes the data flow explicit. ~1 line removed and one fewer place to
    keep in sync if the signature changes.
