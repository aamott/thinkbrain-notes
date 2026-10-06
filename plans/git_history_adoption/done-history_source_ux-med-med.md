# Show File History Simply

Depends on: `graph_version_history`

## Goal

One useful note timeline for local-only, Git-linked, and cloud-synced workspaces.
Architecture: `docs/superpowers/specs/file-history-design.md`.

## Acceptance Criteria

- Show dates, compare, and restore; use small "Recorded here" / "Git history"
  labels only when useful, not branch/source controls.
- A first local snapshot means recording started here, not that the file was
  created then. Older imported versions and original messages remain available.
- "Load older versions" exposes continuation and actionable failures.
- Desktop and phone layouts are accessible and document-scoped.
- UI tests cover existing snapshots, imported history, pagination, and plain copy.

## Files

- `apps/desktop/src/sync/HistoryPanel.tsx`
- `apps/desktop/src/sync/historyTypes.ts`
- `apps/desktop/src/sync/copy.test.tsx`
