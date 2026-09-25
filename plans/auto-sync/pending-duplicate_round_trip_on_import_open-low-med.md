# Verify Import and Open Do Not Sync Twice

**Status:** ⬜ pending · **Urgency:** low · **Difficulty:** med

The old report predates the shared schedule and is no longer an established
current bug. `run_trip` records `sync.lastSyncedAt` after success, and
`registry::attach` gates open-time sync on that timestamp. This appears to
prevent an immediate second trip after a successful import; a failed import
does not open a workspace.

## Remaining verification

- [ ] Count actual round trips when opening a freshly imported vault; confirm
      only the import trip runs.
- [ ] Check a freshly linked, already-open vault and record whether its setup
      check overlaps with another trip.
- [ ] Confirm a long-stale vault still syncs on open.

See `schedule::record_round_trip` and `registry::attach`. The prior trigger
policy and its `idle` / `foreground` terminology were removed by the shared
schedule design.
