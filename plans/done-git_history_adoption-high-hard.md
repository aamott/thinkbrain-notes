# Git History Adoption

Local records and imported current-branch Git ancestry share one paged file
timeline with compare and checkpointed restore. Fetch/push use one persisted
branch; mismatches block sync without hiding retained versions.

## Shipped

- `ingest_git_history` — durable read-only copy of remote/local `.git` history
  into private source refs in the hidden repo; unrelated roots stay separate
  and are never grafted, rebased, pushed, or discarded; versions survive the
  source going away.
- `graph_version_history` — newest-first all-parent walk (merges included) of
  ThinkBrain records plus the selected imported root; stable pagination
  replaced the silent 5,000-commit horizon; a vanished source never hides
  imported versions.
- `history_source_ux` — one timeline with dates, compare and restore; plain
  "Recorded here" / "Git history" labels only when useful; "Load older
  versions" exposes continuation and actionable failures.

## Lasting decisions

- Existing clones keep their checked-out branch; app imports take the remote
  default. The choice is persisted and fetch/push block on mismatch rather
  than falling back — while retained history stays readable.
- `migrate_synthetic_snapshots` was deliberately dropped: existing snapshots
  read directly alongside imported history, so no migration step is needed.

## Known gaps

- Cloud merge-base association is separate work in `auto-sync/cloud_merge_base`.

Architecture: `docs/superpowers/specs/file-history-design.md`.
Product guidance: `.agents/skills/sync-history/SKILL.md`.
