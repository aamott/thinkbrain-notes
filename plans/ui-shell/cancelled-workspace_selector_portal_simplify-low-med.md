# Story: Simplify the workspace-selector portal machinery

**Status:** ✖ cancelled — superseded by `workspace-manager/lift_workspace_switching`, which lifted the controller to shell level and deleted the portal machinery. · **Urgency:** low · **Difficulty:** med

> From `docs/reviews/2026-10-03/workspace-selector-portal-machinery` (finding
> deleted; this is the tracked decision).

## Context

The selector placement feature (title bar / panel headers / drawer) carries
real machinery: a portal + two contexts, `workspaceSelectorInPanel` threading,
`showWorkspaceSelector` flags, and three variant `Record`s in
`WorkspaceSelector.tsx`. PR #12 already moved the variants into one file —
the rest is genuinely load-bearing for the placement feature.

## Decision needed

Whether the placement flexibility earns its apparatus (keep), or the selector
settles on one placement and the portal machinery unwinds (simpler). A design
call; the only mechanical residue is collapsing the three variant `Record`s
into one, which is trivial and can ride any nearby change.

## Acceptance

- [ ] Placement strategy decided; machinery either justified in a comment or
      removed
