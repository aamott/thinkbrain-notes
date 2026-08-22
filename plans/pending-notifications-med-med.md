# Notifications

Cross-cutting notification system. Sync is the first producer; extensions,
updates, and ACP will follow. One store, source-agnostic; each producer owns
its own severity rules and pushes into the store.

## Decisions

- **Source-agnostic store.** A `Notification` carries `source` ("sync" |
  "extension" | …). The store knows nothing about sync codes or extension
  semantics; each producer's adapter owns its severity/stickiness rules.
- **Severity on the notification, not derived centrally.** `severity:
  "silent" | "transient" | "sticky"` is set by the producer when it pushes.
  `silent` = log only, no toast (e.g., "extension loaded"). `transient` =
  toast 8s + log. `sticky` = toast until dismissed + log.
- **Not persisted.** Matches the ephemeral nature of the current producers
  (sync engine state, in-session events). Persistence is a follow-up if a
  producer needs it.
- **Badge count on the bell.** `unreadCount` selector → dot. In scope from
  the start — without it the bell isn't worth clicking.
- **Toast vs. log are separate concerns.** A notification always logs to the
  bell; severity decides whether it also toasts. The toast is the
  attention-grabber; the log is the record.
- **Copy is general.** Copies the full notification — title, message,
  recovery, details — not sync-specific fields.

## Unblocks (by slug)

- `merge_ui` — conflict toast policy (known gap)
- `settle_obvious_conflicts` — "N were handled" announcement (known gap)
- `git_remote_sync` — offline/auth/rejected-push notification surface

## Stories (`plans/notifications/`)

1. ✅ `done-notification_system-med-med.md` — store, types, sync adapter,
   bell log UI, badge count, sticky toasts, StatusBar migration.

## Status

✅ Story 1 done, and the source-agnostic claim is now carried by three
producers, none of which needed a store or UI change: `syncNotificationAdapter`
(problems + setup success), `settleNotificationAdapter` (duplicates merged) and
`conflictNotificationAdapter` (two versions found). The last two closed known
gaps in `settle_obvious_conflicts` and `merge_ui` respectively.

Remaining consumers are extensions, updates and ACP.
