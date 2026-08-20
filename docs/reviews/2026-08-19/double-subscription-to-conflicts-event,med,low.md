- name: sync://conflicts event is subscribed twice — once by useSyncStatus, once by ConflictsPanel
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/sync/ConflictsPanel.tsx
- lines: 79-82
- description: |
    `ConflictsPanel`'s effect (lines 79-82) calls `subscribeToConflictChanges(reload)` to re-fetch the
    conflict list when `sync://conflicts` fires. `useSyncStatus` (used by the same panel at line 39)
    *also* subscribes to `subscribeToConflictChanges` (useSyncStatus.ts line 42) to refresh the status
    footer/badge. So a single conflict event triggers two independent native `list_conflicts` /
    `read_sync_status` round trips and two React state updates in the same component tree.

    This is not a correctness bug — both subscriptions clean up correctly — but it is redundant work
    and a subtle coupling smell: the panel's list reload and the footer's status reload are kept in
    step by accident (both happen to listen to the same event) rather than by design.

    Options: have `useSyncStatus` expose a `reload` callback the panel can reuse for its list, or
    lift the conflict subscription into one hook that both the list and the footer consume. At
    minimum, document why the double subscription is intentional if it is.
- verification: Read ConflictsPanel.tsx, useSyncStatus.ts, and conflictService.ts; confirmed both
  files call `subscribeToConflictChanges` independently against the same `SYNC_CONFLICTS_EVENT`.
