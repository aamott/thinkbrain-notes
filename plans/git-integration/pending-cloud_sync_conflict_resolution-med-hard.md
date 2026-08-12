# Cloud Sync Conflict Auto-Merge and Resolution UI

> **REPLAN NEEDED:** See `plans/wip-git-integration-low-hard.md` — Git sync
> should replace built-in Git entirely. This story covers cloud-drive sync
> conflicts (OneDrive, Google Drive, SyncThing, and similar) that create
> duplicate/conflicted copies, not Git merge conflicts (see
> `pending-git_conflict_resolution-med-hard.md`).

## Goal

Detect and auto-merge cloud-sync conflict files (e.g. `Note (1).md`,
`Note (conflicted copy).md`) so non-technical users don't lose edits. Provide
a clear UI when auto-merge fails or is ambiguous.

## STOP gate — open for discovery

No mockups, settings, or code until these are resolved:

- Which cloud providers to target first (OneDrive, Google Drive, SyncThing,
  iCloud, Dropbox)?
- Conflict-file naming patterns per provider — what heuristics detect them?
- Auto-merge strategy: line-based three-way merge? What base version?
- When auto-merge is uncertain, what does the UI show? (ours/theirs/both +
  manual edit?)
- Should merge run automatically on detection or require user consent?
- How does this interact with the data-safety epic's backup retention?

## Recorded thoughts (not decisions)

User context: cloud services (especially OneDrive) struggle with many small
changing files; `.git` folders on cloud drives have caused real problems.
Recommend **not** syncing `.git` to the cloud unless the user initializes it
themselves.

Git is a mature, battle-tested merge system — duplicating its merge
capabilities in a week is unrealistic. Options to consider during discovery:

- **Git-backed (hidden repo):** auto-init a hidden Git repo outside the
  workspace (e.g. in app-data) to use Git's merge without syncing `.git` to
  the cloud. Risk: mirroring overhead, complexity.
- **Git-optional:** use Git if the vault is already a repo; otherwise a custom
  three-way merge via shadow copies/backups. Risk: two merge code paths.
- **External merge library:** investigate what stable merge libraries exist
  (e.g. `diff-match-patch`, `merge-anything`) rather than reinventing Git's
  merge. Risk: quality varies; Markdown-aware merging is harder than text.
- **`.git` outside the workspace:** store the repo in app-data pointing at the
  vault, avoiding cloud sync of `.git` entirely. Most promising but needs
  validation.

These are starting points for discovery, not commitments.

## Boundary

Cloud-drive conflict files only. Git merge conflicts are owned by
`pending-git_conflict_resolution-med-hard.md`. Local corruption is owned by
`plans/pending-data_safety-med-hard.md`.

## Likely files

- `packages/core/src/` — conflict-file detection patterns, merge logic
  (platform-agnostic, pure functions)
- `apps/desktop/src-tauri/src/commands/` — native file scanning if needed
- `apps/desktop/src/git/` or new `apps/desktop/src/sync/` — conflict
  resolution UI and service

## References

- `plans/wip-git-integration-low-hard.md` — epic and replan note
- `plans/pending-data_safety-med-hard.md` — local corruption recovery
- `plans/git-integration/pending-git_conflict_resolution-med-hard.md` — Git
  merge conflicts
- `plans/pending-extensions-low-hard.md` — lists cloud sync conflict
  resolution as a target extension use case
