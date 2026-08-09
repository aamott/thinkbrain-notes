- name: CalendarTabContainer swallows all read errors and shows an empty grid
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/CalendarTabContainer.tsx
- lines: 52-65
- description: |
    `CalendarTabContainer.read` catches every error from `service.listEntries()` and
    returns `[]`:
    ```ts
    const read = useCallback(async (): Promise<readonly CalendarEntry[]> => {
      try {
        const listing = await service.listEntries();
        return listing.entries.map(...);
      } catch {
        return [];
      }
    }, [service]);
    ```
    When the journal folder is unreadable (no workspace, invalid root, FS error),
    the calendar silently renders an empty grid with no error indication and no
    retry path. This directly violates the project's "fail loudly" rule and is
    inconsistent with `JournalPanelContainer` (lines 45-59), which maps
    `JournalError` codes to the approved `JournalStatus` states
    (`no-workspace`, `invalid-root`, `unreadable`) so the panel can show the
    matching `EmptyState` with Retry / Open folder actions. The `JournalService`
    already throws typed `JournalError`s with approved copy (D63); the calendar
    discards them. `CalendarTab` has no error state surface today, so fixing this
    also requires threading a `CalendarStatus`/error state into the tab UI.
- verification: |
    Read `CalendarTabContainer.tsx` lines 52-65 (catch-all returning `[]`) and
    compared with `JournalPanelContainer.tsx` lines 45-59 (typed error mapping to
    `JournalStatus`). Confirmed `JournalService.listEntries` throws
    `JournalError` with codes `no-workspace | invalid-root | unreadable`
    (`journalService.ts` lines 75-88, 102-121). `CalendarTab` only accepts
    `days: ReadonlyMap`, `totalShowing`, etc. — no error/status prop.
