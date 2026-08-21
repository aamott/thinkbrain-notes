# Notification System

Story 1. Source-agnostic notification store with sync as the first producer.

## Scope

- **Types** (`notifications/notificationTypes.ts`):
  ```
  Notification {
    id, source, dedupKey, title, message,
    recovery?, details?, action?: { label, onClick },
    severity: "silent" | "transient" | "sticky",
    createdAt
  }
  ```
  `dedupKey` lets the store dedupe recurring problems. `action` carries a
  per-notification button (e.g., "Open saved versions"). `severity` replaces
  `sticky: bool` — three states are real (silent / transient / sticky).
- **Store** (`notifications/notificationStore.ts`, Zustand):
  `add`, `dismiss(id)`, `clearAll`, `clearBySource(source)`. Dedupes by
  `dedupKey` so a recurring problem doesn't fill the log.
- **Sync adapter** (`sync/syncNotificationAdapter.ts`): watches
  `useSyncStatus`, pushes problems into the store with `severity` derived
  from the error code. Owns the sticky-code list (below). On successful
  round trip, calls `clearBySource("sync")`. Also migrates the setup-success
  toast — pushes a `severity: "transient"` success notification.
- **Bell log UI**: popover lists notifications newest-first. Each row has
  Copy + individual Dismiss + optional action button. "Clear all" button.
  Badge dot on the bell when `unreadCount > 0`.
- **Sticky toasts**: sticky notifications' toasts don't auto-dismiss; only
  Dismiss or `clearBySource` clears them. Transient toasts keep 8s
  auto-dismiss + hover-pause (shipped).
- **Copy**: general — copies title + message + recovery + details. Not
  sync-specific.

## StatusBar migration

Replaces the existing toast/bell state in `apps/desktop/src/shell/StatusBar.tsx`
(~120 lines: dismissed keys, hover-pause, copy, success toast, error-vs-
success priority, bell popover showing only the current problem). After
migration, StatusBar reads only the notification store — no sync-specific
state, no direct `useSyncStatus` coupling, no `subscribeToSetupSuccess`.

Files touched:
- `apps/desktop/src/shell/StatusBar.tsx` — toast + bell rewritten to read store
- `apps/desktop/src/sync/syncService.ts` — `subscribeToSetupSuccess` moves to adapter
- `apps/desktop/src/sync/useSyncStatus.ts` — consumed by adapter, not StatusBar

## Sticky sync codes

Require user action before the next round trip can succeed:

- `sync.auth_required`
- `sync.credentials_need_https`
- `sync.credentials_invalid`
- `sync.credentials_forbidden`
- `sync.credentials_unavailable`
- `sync.credentials_username_missing`
- `sync.credentials_token_missing`
- `sync.remote_not_found`
- `sync.vault_too_deep`
- `sync.vault_too_many_entries`

All others are transient — may clear on retry.

## Layout

```
apps/desktop/src/notifications/
├─ notificationTypes.ts
├─ notificationStore.ts
└─ useNotifications.ts     # selectors: list, unreadCount, newest
apps/desktop/src/sync/
└─ syncNotificationAdapter.ts  # owns sticky-code list; pushes/clears into store
```

## Acceptance

- [ ] Sticky toast: no auto-dismiss; only Dismiss or sync success clears it.
- [ ] Transient toast: 8s auto-dismiss + hover-pause.
- [ ] Silent notification: logs to bell, no toast.
- [ ] Bell shows undismissed notifications newest-first, from all sources.
- [ ] Badge dot on the bell when `unreadCount > 0`.
- [ ] Each row: Copy (full notification text) + individual Dismiss + optional
      action button. "Clear all" empties the list.
- [ ] Successful sync round trip clears all sync entries; other sources
      untouched; dismissed entries stay dismissed.
- [ ] Setup-success toast migrated to a transient notification.
- [ ] Restart starts with an empty log.
- [ ] Adding a second producer requires only a new adapter — no store or UI
      changes.

## Out of scope

- Persisting across sessions (ephemeral in-memory for now)
- Wiring non-sync producers in this story (extensions, updates, ACP will use `addNotification` in their respective stories)
- Notification settings (per-source mute, etc.)

## Status

⬜ Pending.
