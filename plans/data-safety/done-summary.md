# Data Safety Epic — Completed Work

## Safe Writes & Recovery — `safe_writes_corruption_detection`

Every save writes a temp file then renames over the target; the replaced
version is kept per device in app-data backup. A note that cannot be decoded
is named as damaged and offers its kept version back; same for a note emptied
externally. Deliberately not attempted: general truncation detection — a short
note is not a damaged one (see the story's recorded reasoning in git history).

## Settings Survive a Downgrade — `settings_survive_a_downgrade`

A settings document the app cannot fully read is no longer replaced: newer
documents are read forward-compatible, unparseable ones are set aside rather
than overwritten, and the user is told in-app via the notification system.

Deferred and unclaimed: vault integrity scan, retention policy beyond the
three kept versions, frontmatter repair flow.
