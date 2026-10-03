# History Pruning and Size Policy

Story 7. **Urgency:** low · **Difficulty:** med

Most of the initial scope is already implemented in
`apps/desktop/src-tauri/src/commands/sync/maintain.rs`: daily maintenance keeps
90 days of private undo history, drops files over 25 MB from older snapshots,
reports repository usage, and can clear local undo history without touching
notes or synced history. Loose unreachable objects are collected; packed
objects are deliberately left alone.

## Remaining

- [ ] Decide whether retention and the historical-file threshold need user
      controls. Current values are fixed documented defaults.
- [ ] Verify usage reporting and reclaimed-space results on supported
      platforms.
- [ ] Decide whether packed-object compaction is worth the cost; current
      maintenance does not rewrite packs.

Do not rewrite synced history or remove imported roots or common ancestors
needed by unresolved merges (`cloud_merge_base`). Clearing undo history must
not clear those baselines. The existing cleanup only rebuilds the private
checkpoint chain; baseline protection is part of the upcoming cloud work.
