# Lane test does not prove the lane

Carried from story 6b. The concurrency test for "two syncs at once on one vault"
still passed if the per-workspace lane was removed: whichever thread merged first
left the rest nothing to merge, and a collision needs two of them past the
fetch before either commits.

## Acceptance

- [x] A test fails if the lane is removed — `a_sync_waits_for_the_workspace_lane_before_entering_the_trip` holds the workspace mutex and asserts no `sync` flips `engine.syncing()` until the lock is released.

## Status

Done.
