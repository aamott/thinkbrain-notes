# Notifications

Cross-cutting notification system. Sync is the first producer; extensions,
updates, and ACP will follow. One store, source-agnostic; each producer owns
its own severity rules and pushes into the store.

## Decisions

- **Source-agnostic store.** A `Notification` carries `source` ("sync" |
  "extension" | …). The store knows nothing about sync codes or extension
  semantics; each producer's adapter owns its severity/stickiness rules.
- **Severity on the notification, not derived centrally.** `sticky: bool` is
  set by the producer when it pushes. The store trusts it.
- **Not persisted.** Matches the ephemeral nature of the current producers
  (sync engine state, in-session events). Persistence is a follow-up if a
  producer needs it.
- **Badge count on the bell.** `unreadCount` selector → dot. In scope from
  the start — without it the bell isn't worth clicking.
- **Toast vs. log are separate concerns.** A notification may toast (transient
  or sticky) and always logs to the bell. The toast is the attention-grabber;
  the log is the record.

## Stories (`plans/notifications/`)

1. `pending-notification_system-med-med.md` — store, types, sync adapter,
   bell log UI, badge count, sticky toasts.

## Status

⬜ Pending.
