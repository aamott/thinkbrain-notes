# Core Adapter Interfaces (Holding Item)

## Goal

Assess proven cross-cutting adapter gaps without launching a blanket five-adapter
refactor. Mobile reuses the existing Tauri adapters and does not make this a
prerequisite. Feature-specific adapter work remains in its owning epic.

If multiple owners demonstrate the same boundary gap, re-home a narrowly scoped
interface/refactor to a platform or architecture owner before implementation.

## Acceptance Criteria

- [ ] Inventory current filesystem, search, app-path, Git, and settings boundaries
      and identify only duplicated platform coupling that cannot stay feature-owned.
- [ ] Record owner and scope for each proven shared gap; reject speculative interfaces.
- [ ] Any approved `packages/core` interface contains no DOM, Node-only, or Tauri types.
- [ ] Broad desktop refactoring is not performed from this maintenance holding item.
- [ ] `packages/core` remains platform-agnostic (`pnpm typecheck` passes).

## References

- `plans/technical-decisions.md` — Platform, Repository Structure sections
- `apps/desktop/src/native/commands.ts` — current direct-Tauri bridge
- `packages/core/src/index.ts` — where interfaces should live
- `plans/pending-mobile-low-hard.md` — mobile reuses current adapters and is not blocked by this holding item
