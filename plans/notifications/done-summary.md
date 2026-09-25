# Notifications Epic — Completed Work

## Notification System — `notification_system`

Source-agnostic `Notification` store (`source`, `severity: silent|transient|
sticky`, optional recovery/action), bell log with unread badge, sticky toasts.
Shipped with four producers, none needing store changes: sync problems +
setup success, obvious-conflict settling, two-version conflicts, and settings
quarantine. Remaining producers (extensions, updates, ACP) consume the same
store when they land.
