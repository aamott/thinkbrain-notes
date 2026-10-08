# Story: Lift workspace switching out of the explorer

Supersedes `ui-shell/workspace_selector_portal_simplify`.

## Context

The portal/outlet machinery exists because `useWorkspaceSwitching` lives inside
`WorkspaceExplorer` while the selector renders in the title bar, other panels'
headers (search, journal) and the phone drawer. Placement count is not the cost;
controller location is.

## Acceptance

- [ ] Switching controller + its dialogs provided at shell level (context).
- [ ] Selector rendered directly at each placement; portal/outlet files removed.
- [ ] Placement setting decided (keep title bar or panel header + drawer only).
- [ ] Tests; `pnpm qa` clean.
