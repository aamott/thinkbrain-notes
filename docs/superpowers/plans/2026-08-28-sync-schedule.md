# Sync Schedule — Completed

Implementation record for `docs/superpowers/specs/2026-08-28-sync-schedule-design.md`.
This replaced the earlier `sync.trigger` policy and its separate foreground
command. The detailed task-by-task recipe is retired; the spec records the
reasoning and this file records the shipped shape.

## Shipped behavior

- Automatic sync waits for both workspace quiet time and the wall-clock
  interval since the last attempt. Defaults are 30 seconds quiet and 60 seconds
  between attempts; settings are clamped to 5–300 and 30–3600 seconds.
- Sync-on-open is gated by the interval since the last successful trip.
- Leaving the app records settled edits and starts the shared sync round trip
  when enabled. It is best effort; Android may freeze the process before it
  finishes.
- A wall-clock attempt timestamp prevents process freezes from making the
  interval appear elapsed. Successful trips also record `sync.lastSyncedAt`
  for the open-time gate. Stuck in-flight claims can be taken over after ten
  minutes.
- The sweeper continues local recording and history maintenance even when
  automatic network sync is disabled.
- Timing details are advanced settings; `sync.automatically` is the main
  user-facing control.

See `apps/desktop/src-tauri/src/commands/sync/schedule.rs`,
`registry.rs`, `engine.rs`, and `packages/core/src/settings/modules/sync.ts`.
