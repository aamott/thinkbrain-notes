# Split DesktopShell.tsx

## Goal

`apps/desktop/src/shell/DesktopShell.tsx` is 1,122 lines — exceeds the 800-line limit in AGENTS.md. Per `apps/desktop/src/AGENTS.md`, it should be "a slim composition orchestrator (state/effects/callbacks only)." Split into focused modules.

## Scope

- Extract state effects, callbacks, and composition into separate files under `apps/desktop/src/shell/`.
- Chrome (title bar, activity bar, status bar, tab content) already lives in separate files — identify what else is inline and extract it.
- Keep `DesktopShell.tsx` as the orchestrator only.

## Acceptance Criteria

- [ ] `DesktopShell.tsx` is under 800 lines.
- [ ] No new behavior — all existing tests pass unchanged.
- [ ] Extracted modules are focused (one responsibility each).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.
