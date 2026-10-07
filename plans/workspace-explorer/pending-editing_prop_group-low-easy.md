# Story: Group the explorer view's editing props

**Status:** ⬜ pending · **Urgency:** low · **Difficulty:** easy

> Residual from `docs/reviews/2026-10-03/explorer-view-prop-sprawl` (finding
> deleted). PR #12 already collapsed the switching props into `switching`; the
> editing cluster is what remains.

## Context

`WorkspaceExplorerView` still takes ~15 flat props including the editing
cluster — `renaming`, `creating`, `pendingDelete`, `pendingExtensionConfirm`,
`inlineCreateError`, `extensionConfirmError` — alongside `actionError`. A
grouped `editing = { renaming, creating, pendingDelete,
pendingExtensionConfirm, inlineCreateError, extensionConfirmError }` prop
names the unit those fields already are.

## Acceptance

- [ ] The editing/pending-* props arrive as one grouped prop
- [ ] `WorkspaceExplorer.tsx` constructs it in one place
