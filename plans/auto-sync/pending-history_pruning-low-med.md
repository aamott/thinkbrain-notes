# History Pruning + Size Policy

Story 7. gix has no LFS; unbounded history eats disks — binaries worst.

## Scope

- Settings: history size display, retention (keep N days / N versions),
  per-file size cap for binary history (over-cap files: current version
  only), "Clear history" with confirmation.
- Prune + gc via gix on a maintenance schedule; never prunes commits still
  needed as merge base or unpushed to remote.

## Acceptance

- [ ] Size shown accurately; prune reclaims disk; protected commits survive
- [ ] Defaults documented and safe (suggest: 90 days / 25 MB binary cap)

## Status

⬜ Pending.
