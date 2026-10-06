# Render Restore Events

Depends on: `pending-record_restore_provenance-high-hard.md`

## Goal

Make a newly restored version immediately recognizable in Version history.

## Acceptance Criteria

- A restore entry is headed by when the restore happened, such as "Restored
  just now," with secondary text naming the source date.
- Restore-specific iconography or text remains understandable without color.
- The restored entry appears immediately after both panel and preview restores.
- Ordinary saves, imported Git commits, conflict resolutions, and first
  snapshots retain their own copy.
- Source timestamps that are missing or invalid degrade to useful copy.
- Desktop and phone tests cover current, older, and unknown source dates.

## Files

- `apps/desktop/src/sync/HistoryPanel.tsx`
- `apps/desktop/src/sync/syncCopy.ts`
- `apps/desktop/src/sync/historyTypes.ts`
