# Notification System

Story 1. Source-agnostic notification store with sync as the first producer.

## Scope

- **Types** (`notifications/notificationTypes.ts`):
  `Notification { id, source, title, message, recovery?, details?, sticky, createdAt }`.
- **Store** (`notifications/notificationStore.ts`, Zustand):
  `add`, `dismiss(id)`, `clearAll`, `clearBySource(source)`. Dedupes by a
  producer-supplied key so a recurring problem doesn't fill the log.
- **Sync adapter** (`sync/syncNotificationAdapter.ts`): watches
  `useSyncStatus`, pushes problems into the store with `sticky` derived from
  the error code. Owns the sticky-code list (below). On successful round
  trip, calls `clearBySource("sync")`.
- **Bell log UI**: popover lists notifications newest-first. Each row has
  Copy + individual Dismiss. "Clear all" button. Badge dot on the bell when
  `unreadCount > 0`.
- **Sticky toasts**: sticky notifications' toasts don't auto-dismiss; only
  Dismiss or `clearBySource` clears them. Transient toasts keep 8s
  auto-dismiss + hover-pause (shipped).

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

StatusBar reads only the store — it doesn't know where notifications came
from. Future producers (extensions, updates, ACP) get their own adapter.

## Acceptance

- [ ] Sticky toast: no auto-dismiss; only Dismiss or sync success clears it.
- [ ] Transient toast: 8s auto-dismiss + hover-pause.
- [ ] Bell shows undismissed notifications newest-first, from all sources.
- [ ] Badge dot on the bell when `unreadCount > 0`.
- [ ] Each row: Copy + individual Dismiss. "Clear all" empties the list.
- [ ] Successful sync round trip clears all sync entries; other sources
      untouched; dismissed entries stay dismissed.
- [ ] Restart starts with an empty log.
- [ ] Adding a second producer requires only a new adapter — no store or UI
      changes.

## Out of scope

Persisting across sessions · non-sync producers (extensions, updates, ACP) ·
notification settings (per-source mute, etc.).

## Status

⬜ Pending.
