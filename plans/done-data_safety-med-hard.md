# Data Safety & Recovery

User notes are irreplaceable; data loss is the worst-case failure. Guarantee
Markdown files survive crashes, partial writes, and disk errors — with a
clear recovery path and no silent corruption or overwrite without a
recoverable backup.

## Shipped

- `safe_writes_corruption_detection` — temp-file-then-rename saves; the
  replaced version is kept per device in app-data; undecodable and
  externally-emptied notes are named damaged and offer their kept version
  back. Deliberately not attempted: general truncation detection — a short
  note is not a damaged one.
- `settings_survive_a_downgrade` — newer settings documents read
  forward-compatible; unparseable ones are set aside rather than overwritten;
  the user is told in-app via the notification system.

## Lasting decisions

- Backups live in per-device app-data, never in the vault.
- Detection is read-time on open, not background; the recovery UI shows what
  was detected and offers the last backup — never pretending data is safe.

## Known gaps (deferred, unclaimed)

Vault integrity scan (orphaned backups, stale temp files), a retention policy
beyond the three kept versions, a frontmatter repair flow, cloud-sync conflict
integration (`auto-sync`). Non-goals: a proprietary backup service,
Git-duplicating versioning, AI-driven repair.
