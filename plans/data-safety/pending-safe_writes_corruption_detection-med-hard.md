# Story: Safe Writes, Corruption Detection, and Recovery UI

## Goal

Atomic, crash-safe note saves; corruption detection on open; minimal recovery
UI. First slice of the data-safety epic — no snapshot retention, vault scan, or
repair flow yet.

## Acceptance Criteria

- [x] Every save writes a temp file then renames over the target; a crash
      mid-write leaves the previous file intact. `write_file_atomically` had
      existed and been tested since settings needed it — notes were the one
      caller still writing in place, which is the path this epic exists to
      protect. Both note sites in `markdown.rs` now use it.
      Proven by inode: `fs::write` opens with `O_TRUNC` and keeps the inode, a
      rename gives the name a new one, so the test asserts the number changed.
      Unix-only, because the helper is explicit that its Windows fallback
      (remove-then-rename) is not atomic and there is nothing equivalent for a
      test to read.
- [ ] Previous version kept briefly as a backup (location/retention TBD by
      discovery).
- [ ] Opening detects truncation, encoding errors, and unexpected empty
      results from non-empty files.
- [ ] Corruption routes to a recovery UI (not a silent empty editor) showing
      what was detected and offering the last backup if available.
- [ ] Honest messaging only — never claim data is safe when it isn't.
- [ ] No app caches or backups in the vault's app-data directory.
- [ ] Vitest covers atomic writes, detection cases, and recovery states.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## What shipped, and what it exposed

Routing notes through the atomic helper changes the shape of what reaches the
file watcher: a created file at a name nobody asked about, and the destination
arriving by rename rather than by write. Either could have surfaced as an
outside edit, which is how a tab reloads itself out from under someone
mid-sentence. The existing echo-suppression test could not have caught it — it
writes with `fs::write` rather than through the save path — so a second test
now drives the real one and asserts the app reports no change of its own. The
temp name is hidden, so the vault walk skips it for the same reason it skips
every other dot-entry; that is pinned, because a later change to a non-hidden
temp name would be a quiet regression.

Still open on this story: the backup, the detection, and the recovery UI. The
questions below are unanswered and are product decisions, not implementation
ones — the backup location in particular cannot be chosen without deciding
whether backups are allowed to reach the user's cloud drive.

## Discovery (resolve before implementation)

- Backup location: `.thinkbrain-backups/` in the vault, OS temp, or app-data?
  Vault-adjacent is most recoverable but may sync to cloud drives.
- Retention: count-based or time-based?
- Detection on every open, or only on parse failure?

## Likely files

- `apps/desktop/src/workspace/workspaceDocumentAdapter.ts` — atomic save path
- `packages/core/src/note-model.ts` / `markdown.ts` — detection helpers (pure)
- `apps/desktop/src/tabs/` — recovery UI
- `apps/desktop/src-tauri/src/commands/` — native temp/rename if needed

## References

- `plans/pending-data_safety-med-hard.md` — epic
- `plans/app-vision.md` — User data separation, Bring your own sync
- `plans/wip-note-model-low-hard.md` — note model and save path
