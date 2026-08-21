# A first sync of a large vault is silent

Carried from stories 6a and 6b. A first push or pull of a large vault has no
progress, so the button looks stuck while it works.

## Acceptance

- [x] A long first sync says it is working, not just that someone clicked —
      History "bring in step" reuses the footer's live phase copy
      (saving / checking / combining / sending) via `describePill` +
      `useSyncStatus`

## Status

🟩 Done for phase-named busy copy. Fine-grained byte/object progress remains
deferred outside this tranche.
