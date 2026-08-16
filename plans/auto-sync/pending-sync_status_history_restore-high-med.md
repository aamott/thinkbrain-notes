# Sync Status, History, Restore

Story 5. The trust surfaces. All work with zero sync configured.

## Scope

- **Status pill** (direct `StatusBar.tsx` wiring — it's hardcoded today, no
  registration API needed yet): `✓ All synced · 9:31 AM` / syncing spinner /
  `⚠ 2 items need attention` + count. Click → conflicts panel or history.
  Persist last-success time + last-error message; errors always name a
  recovery action.
- **Sync History:** friendly list from hidden-repo commits ("Today 9:31 AM —
  3 notes updated"), expandable to per-file lines with Restore buttons.
- **Restore previous version:** right-click note → dated list from hidden
  repo → restore (restore itself is checkpointed, so it's undoable too).
- Local-only conflict-rate counter surfaced here (feeds the
  three-way-for-cloud go/no-go; no telemetry).

## Acceptance

- [ ] Pill reflects real state transitions; error copy includes action
- [ ] History readable by a nonuser-of-git; expandable raw message escape
      hatch
- [ ] Restore round-trip test incl. restore-of-restore
- [ ] Everything functions with no remote/cloud configured

## Status

⬜ Pending.
