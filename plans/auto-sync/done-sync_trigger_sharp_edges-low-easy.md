# Sync Schedule Edge Cases

**Status:** ✅ two resolved; one split to follow-up · **Urgency:** low · **Difficulty:** easy

This story reviewed three issues in the retired `sync.trigger` policy. The
policy was later replaced by the shared schedule in
`docs/superpowers/specs/2026-08-28-sync-schedule-design.md`.

- **Portable platform-specific trigger:** removed with `sync.trigger`; the
  replacement schedule works on desktop and Android.
- **Clock moved backwards:** fixed by `schedule::elapsed_at_least`, which treats
  a future timestamp as due rather than fresh.
- **Last-sync settings write can race a settings save:** still open in
  `last_sync_timestamp_skips_the_settings_lock`. The lost
  value is usually only `sync.lastSyncedAt`, but the exception needs a decision
  or a code comment.
