# Desktop Foreground Sync Concern

**Status:** ✅ closed by superseding design · **Urgency:** med · **Difficulty:** med

The concern was that `visibilitychange` means “minimised” on desktop, not
“returned to the app,” while the old `foreground` policy promised both.

The shared schedule removed `sync.trigger` and all foreground-resume syncing.
There is no desktop focus/visibility mismatch now: automatic sync is driven by
quiet time plus a wall-clock interval; leaving may request a best-effort flush.
The `sync.onLeave` setting describes that behavior. No separate focus event or
platform-specific trigger path is needed.

Current behavior and rationale:
`docs/superpowers/specs/2026-08-28-sync-schedule-design.md`.
