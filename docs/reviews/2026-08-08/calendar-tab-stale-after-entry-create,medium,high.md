- name: Calendar tab never reloads after entries change (stale grid)
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/CalendarTabContainer.tsx
- lines: 67-75
- description: |
    `CalendarTabContainer` loads entries exactly once on mount:
    ```ts
    useEffect(() => {
      let cancelled = false;
      void read().then((next) => {
        if (!cancelled) setEntries(next);
      });
      return () => { cancelled = true; };
    }, [read]);
    ```
    `read` depends on `[service]`, and `service` is a stable singleton created in
    `activateJournal` (`extensions/builtins/journal.tsx` line 56), so the effect
    never re-runs. There is no `reloadToken` (contrast `JournalPanelContainer`
    line 40/101), no file-watcher subscription, and no change event from
    `DesktopExtensionWorkspace` (confirmed: `extensionWorkspace.ts` exposes no
    `onDidChange`/`subscribe`/`watch` API). Consequently, when a user creates a
    new entry from the journal panel (or via the `new-entry`/`today` commands)
    while the calendar tab is open, the calendar's dot counts and day states
    remain stale until the tab is closed and reopened. The panel and the
    calendar share the same `JournalService` instance, so the data is available;
    only the calendar's lack of a reload trigger is at fault.
- verification: |
    Read `CalendarTabContainer.tsx` lines 49/67-75 (single `useEffect` on
    `[read]`; no `reloadToken` state). Confirmed `JournalPanelContainer.tsx`
    lines 40/101/126-134 uses `reloadToken` + `run(...).finally(reload)` to
    refresh after mutations. Grepped `apps/desktop/src` for
    `onNotesChanged|onWorkspaceChanged|fileWatcher|onFileChange` — no matches;
    `extensionWorkspace.ts` has no change-notification API. `service` is created
    once in `journal.tsx` line 56 and passed to both containers.
