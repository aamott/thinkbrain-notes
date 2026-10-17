# Story: Move blocking I/O commands off the sync IPC path

Revalidated on `main` at `054406b3`: `sync_now` is gone and network rounds/imports
are already threaded. Workspace scans, media reads, SQLite operations, and other
filesystem work still need attention. See
`docs/reviews/2026-10-10/native-command-io-followup-med-med.md`.

## Acceptance

- [x] Revalidate the registered command surface and background worker paths.
- [x] Move read-only workspace scans and media reads to blocking workers,
      preserving validation, output, errors, and stale-result handling.
- [ ] Move search/index work off the main path, including synchronous callers
      waiting on the same connection locks.
- [ ] Address remaining heavy history/mutation/dialog work in focused changes.
- [ ] No new races: resolve mutable workspace state after yielding and preserve
      lifecycle/lock ordering.

First-fix validation: focused Rust scheduling/path/result tests, unchanged
`useWorkspaceSession` stale-result tests, and `pnpm qa` pass. No live native
window or emulator run is claimed for this change.
