# Explain Imported History

Depends on: `pending-migrate_synthetic_snapshots-high-hard.md`

## Goal

Explain where older versions came from and when more are available without
turning Version history into source-control UI.

## Acceptance Criteria

- The first synthetic snapshot is not presented as the beginning of history
  when older imported versions exist.
- Imported commit messages and dates remain available, while source labels use
  plain language such as "Existing history" and "Recorded by ThinkBrain."
- Multiple unrelated sources are distinguishable without branch or ref jargon.
- Pagination exposes a clear "Load older versions" state and an actionable
  failure when another page cannot be read.
- Desktop and phone layouts remain document-scoped and accessible.
- Copy tests reject unnecessary Git implementation terms.

## Files

- `apps/desktop/src/sync/HistoryPanel.tsx`
- `apps/desktop/src/sync/historyTypes.ts`
- `apps/desktop/src/sync/copy.test.tsx`
