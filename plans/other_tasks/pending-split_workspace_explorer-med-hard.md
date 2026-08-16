# Split WorkspaceExplorer.tsx

## Goal

`apps/desktop/src/workspace/WorkspaceExplorer.tsx` is 1,238 lines — exceeds the 800-line limit in AGENTS.md. Split into focused subcomponents without changing behavior.

## Scope

- Extract tree node rendering, context menu, drag-and-drop, and inline rename into separate files under `apps/desktop/src/workspace/`.
- Keep `WorkspaceExplorer.tsx` as the top-level orchestrator (state + composition only).
- Fix the pre-existing Tailwind lint warnings (arbitrary values with named equivalents, redundant class pairs) during the split.

## Acceptance Criteria

- [ ] `WorkspaceExplorer.tsx` is under 800 lines.
- [ ] No new behavior — all existing tests pass unchanged.
- [ ] Extracted components are focused (one responsibility each).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.
