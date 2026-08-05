# Core Adapter Interfaces (Prerequisite)

## Goal

Define the platform adapter interfaces in `packages/core` that both
`apps/desktop` and `apps/mobile` implement: `FileSystemAdapter`,
`SearchAdapter`, `AppPathsAdapter`, `GitAdapter`, `SettingsAdapter`. These are
the prerequisite for the mobile epic and for refactoring the desktop app onto
the adapter contract.

This story is the bridge between the current desktop-direct-Tauri architecture
and the cross-platform hub-and-spoke contract described in
`technical-decisions.md`. It may belong in a separate refactor epic rather than
`mobile` — the manager should decide.

## Acceptance Criteria

- [ ] `FileSystemAdapter`, `SearchAdapter`, `AppPathsAdapter`, `GitAdapter`,
      `SettingsAdapter` interfaces are defined in `packages/core`.
- [ ] Interfaces contain no DOM, Node-only, or Tauri types.
- [ ] Desktop app is refactored to implement these adapters (or a follow-up
      story tracks that work).
- [ ] `packages/core` remains platform-agnostic (`pnpm typecheck` passes).

## References

- `plans/technical-decisions.md` — Platform, Repository Structure sections
- `apps/desktop/src/native/commands.ts` — current direct-Tauri bridge
- `packages/core/src/index.ts` — where interfaces should live
- `plans/pending-mobile-low-hard.md` — prerequisite note
