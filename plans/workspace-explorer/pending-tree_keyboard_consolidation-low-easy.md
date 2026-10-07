# Story: Consolidate tree keyboard handling

**Status:** ⬜ pending · **Urgency:** low · **Difficulty:** easy

> From `docs/reviews/2026-10-03/tree-keyboard-handling-split` (finding
> deleted; this is the tracked work).

## Context

Tree keyboard handling is split across three files: list-level
ArrowUp/Down/Home/End in `useWorkspaceTreeNavigation.ts`, row-level
ArrowLeft/Right/Enter/Space in `WorkspaceTreeItem.handleKeyDown`
(`WorkspaceTree.tsx`), with the contract spread between them. One module
should own the whole keyboard map so a reader can see every key in one place.

## Acceptance

- [ ] The full tree keyboard contract lives in one module
- [ ] Row-level keys delegate to it rather than handling keys themselves
