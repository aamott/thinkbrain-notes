# Mobile Sync Trigger Investigation

**Status:** ✅ complete, superseded · **Urgency:** high · **Difficulty:** med

This work first replaced Android's idle-only sync with explicit lifecycle
triggers. The later schedule design removed `sync.trigger` and the foreground
command, replacing them with one shared wall-clock schedule. The old
implementation recipe was deleted; see
`docs/superpowers/specs/2026-08-28-sync-schedule-design.md` and
`docs/superpowers/plans/2026-08-28-sync-schedule.md` for the current design.

The investigation established that Android WebView emits `visibilitychange`
on background and foreground. It also verified the then-current lifecycle
behavior on an emulator and identified process-freeze risks that led to the
wall-clock schedule and orphaned-sync recovery.

The original mid-flush process-kill experiment was not run. Leaving the app
starts a best-effort shared round trip; the next scheduled/open sync is the
recovery path. Private Android Git sync was later verified separately on an
emulator in `docs/superpowers/specs/2026-08-27-android-git-access-design.md`.
