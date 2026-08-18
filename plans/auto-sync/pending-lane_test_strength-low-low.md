# Lane test does not prove the lane

Carried from story 6b. The concurrency test for "two syncs at once on one vault"
still passes if the per-workspace lane is removed: whichever thread merges first
leaves the rest nothing to merge, and a collision needs two of them past the
fetch before either commits.

## Acceptance

- [ ] A test fails if the lane is removed — it has to reach two syncs past
      fetch before either commits, not just "they all come back agreeing"

## Status

⬜ Pending.
