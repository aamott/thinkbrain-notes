# Selective Restore Controls

Depends on: `pending-editable_restore_draft-med-hard.md`

## Goal

Let users apply individual changes from the recorded version to the editable
result without Git terminology.

## Acceptance Criteria

- Split mode identifies recorded source and working result and offers
  per-change `Use recorded` and `Keep current` actions.
- Inline mode provides equivalent actions with the same direction and result.
- Additions and removals are described as effects on the working result, not
  relabeled from an oppositely oriented diff.
- Applying one change edits only that change and participates in editor Undo.
- Overlapping manual edits disable or recompute affected controls without
  discarding the draft.
- Keyboard and screen-reader users can locate each changed region, understand
  its effect, and invoke its actions.
- Conflict merge controls retain their existing incoming/current semantics.

## Files

- `apps/desktop/src/sync/CodeMirrorDiff.tsx`
- `apps/desktop/src/sync/VersionDiffTab.tsx`
- `apps/desktop/src/sync/mergeModel.ts`
