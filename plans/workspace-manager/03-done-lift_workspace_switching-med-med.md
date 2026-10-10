# Story: Lift workspace switching out of the explorer

Supersedes `ui-shell/workspace_selector_portal_simplify`.

## Context

The portal/outlet machinery exists because `useWorkspaceSwitching` lives inside
`WorkspaceExplorer` while the selector renders in the title bar, other panels'
headers (search, journal) and the phone drawer. Placement count is not the cost;
controller location is.

## Acceptance

- [x] Switching controller + its dialogs provided at shell level (context).
- [x] Selector rendered directly at each placement; portal/outlet files removed.
- [x] Placement setting decided (kept `ui.workspaceSelectorPlacement` (title bar | panel headers); phone drawer always).
- [x] Tests; `pnpm qa` clean.
