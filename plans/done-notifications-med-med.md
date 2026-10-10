# Notifications

Cross-cutting notification system: one source-agnostic store; each producer
owns its severity rules and pushes in. Sync was the first producer.

## Shipped

- `notification_system` — `Notification` store (`source`, `severity:
  silent|transient|sticky`, optional recovery/action), bell log with unread
  badge, sticky toasts, StatusBar migration. Shipped with four producers,
  none needing store or UI changes: sync problems + setup success,
  obvious-conflict settling, two-version conflicts, settings quarantine.

## Lasting decisions

- Severity is set by the producer at push time: `silent` = log only,
  `transient` = toast 8s + log, `sticky` = toast until dismissed + log. The
  store knows nothing about producer semantics.
- Not persisted — matches the ephemeral producers; revisit if one needs it.
- Every notification logs to the bell; severity only decides toasting. The
  badge count is the durable awareness path.
- Copy grabs the whole notification — title, message, recovery, details —
  never producer-specific fields.

## Known gaps

- Remaining producers to wire in: extensions, updates, ACP — each consumes
  the same store with its own adapter.
