# Mobile Git Adapter

## Goal

Provide Git integration on mobile via the `GitAdapter` interface. System Git is
not reliably available on mobile, so the likely path is `isomorphic-git` (pure
JS). If that proves too heavy or unreliable for MVP-mobile, this story may be
deferred further — note the decision in the epic Status section.

## Acceptance Criteria

- [ ] `GitAdapter` implementation lives in `apps/mobile/src/adapters/`.
- [ ] Implements the `GitAdapter` interface from `packages/core`.
- [ ] Supports at minimum: repo detection, status, stage/unstage, commit,
      branch list.
- [ ] If `isomorphic-git` is used, it runs without a native Git binary.
- [ ] If deferred: document the decision and the fallback (no Git on mobile for
      initial release) in the epic Status section.
- [ ] Errors are typed and fail loudly.

## References

- `plans/pending-git-integration-high-hard.md` — desktop Git epic (command surface reference)
- `plans/technical-decisions.md` — Git section
- `plans/pending-mobile-low-hard.md` — Platform adapter contract
