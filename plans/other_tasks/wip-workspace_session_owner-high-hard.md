# Story: One workspace-session owner (renderer + native)

Two independent 2026-10-10 architecture reviews converged on this
(`docs/reviews/2026-10-10/architecture-shell-state-med-hard.md` #1,
`architecture-native-backend-med-hard.md` #1).

Renderer: `useWorkspaceLifecycle` owns `restoredWorkspacePath` but
`WorkspaceExplorer` owns the actual open/list sequence and confirms back —
two authorities for workspace identity. Each chrome also builds its own
`useWorkspaceSwitching` controller.

Native: watchers (`WatchInterest`), sync engines (`Registry`), the pooled
search connection, and `WorkspaceWindowRoots` are four independent maps with
different keys/lifetimes and no single owner. The leaks this produced:
engine surviving managed-vault delete (fixed — `detach_engine_on_delete`),
engine adopted under a dead label mid-bootstrap (fixed same commit),
search pool releasable only via managed delete.

## Acceptance

- [ ] `useWorkspaceSession` (or equivalent) owns open/list/restore phase,
      rootPath, snapshot; explorer consumes it. One switching controller.
- [ ] Native per-workspace resources keyed by one session/root record so
      "release everything for root X" is one call, not four.
- [ ] No regression in restore, multi-window, in-window switch races.
