- name: Calendar tab does not react to startOfWeek or calendarDefaultView setting changes
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/builtins/journal.tsx
- lines: 162-179
- description: |
    The `calendar` tab factory reads `startOfWeek` and `calendarDefaultView`
    once, inline, when the factory function is called:
    ```ts
    factory: () => (
      <CalendarTabContainer
        weekStartsOn={context.settings.get<string>("startOfWeek") === "monday" ? 1 : 0}
        initialView={context.settings.get<string>("calendarDefaultView") === "week" ? "week" : "month"}
        onViewChange={(view) => { void context.settings.set("calendarDefaultView", view); }}
      />
    )
    ```
    `CalendarTabContainer` consumes these as initial state
    (`useState<CalendarView>(initialView)`, `weekStartsOn` prop used directly in
    `calendarGrid`). The factory closure is invoked when the tab mounts; after
    that, neither prop updates when the setting changes. So:

    * Changing `startOfWeek` in Settings while the calendar is open does not
      re-flow the grid to the new week start.
    * Changing `calendarDefaultView` in Settings while the calendar is open does
      not switch the view (the strip's own `onViewChange` writes the setting, so
      the strip and Settings can drift).

    The `MetadataHeader` component in the same file (lines 90-98) shows the
    reactive pattern: `useDefinitions` uses `useSyncExternalStore` +
    `context.settings.onDidChange("fieldDefinitions", ...)` to re-read on
    change. The calendar settings should follow the same pattern, either via a
    `useWeekStart`/`useDefaultView` hook or by lifting the reads into the
    container and subscribing.
- verification: |
    Read `journal.tsx` lines 162-179 (factory reads settings inline, no
    subscription). Read `CalendarTabContainer.tsx` lines 39-48
    (`useState(initialView)`; `weekStartsOn` is a plain prop with default `0`).
    Compared with `useDefinitions` in `journal.tsx` lines 90-98 which uses
    `useSyncExternalStore` + `context.settings.onDidChange`. The settings host
    exposes `onDidChange` (used for `fieldDefinitions`), so the mechanism exists.

## Investigation notes (2026-08-08, unverified)

Written from reading only — no code was changed and none of this was run.
Treat it as a lead, not a conclusion.

`builtins/journal.tsx` (the tab factory) reads `startOfWeek` and
`calendarDefaultView` once, at factory time. A `useWatchedSetting(context, key)` hook
generalising the existing `useDefinitions` in the same file, plus a small host component
subscribing via `useSyncExternalStore` + `context.settings.onDidChange`, would make both
reactive. Note `weekStartsOn` already flows straight through `CalendarTabContainer` as a prop,
but `initialView` only seeds `useState` once, so that container also needs to re-sync when the
prop changes.
