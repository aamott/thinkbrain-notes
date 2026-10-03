# Git History Adoption

Local records and imported current-branch Git ancestry share one paged file
timeline with compare and checkpointed restore. Fetch/push use one persisted
branch; mismatches block sync without hiding retained versions.

Architecture: `docs/superpowers/specs/file-history-design.md`.
Product guidance: `.agents/skills/sync-history/SKILL.md`.
Cloud merge-base association remains separate work in `auto-sync/cloud_merge_base`.

`migrate_synthetic_snapshots` was deliberately dropped: existing snapshots read
directly alongside imported history, so no migration step is needed.
