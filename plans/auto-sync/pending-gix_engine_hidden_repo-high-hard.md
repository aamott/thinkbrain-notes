# gix Engine + Hidden Repo

Story 1 of `pending-auto_sync-med-hard.md`. Foundation for everything else.
The `gix` dependency, and the hidden repo's separate-worktree layout, are proven
in story 0 (`pending-gix_build_spike-high-med.md`) — start from `hidden_repo.rs`
as it stands rather than from nothing.

## Scope

- ✅ `gix` dependency and `src-tauri/src/commands/sync/hidden_repo.rs` (story 0).
- Key the hidden repo by workspace identity and create it lazily on first
  workspace open — story 0 proved the layout, but nothing calls it yet.
- **Auto-commit:** batch vault changes (from `workspace://changed`, echo
  suppression already applied) and commit on idle. Template message:
  `Sync <local datetime> — <n> notes changed`.
- **Checkpoint API** (the undo-safety invariant): `checkpoint(paths) ->
  commit_id` — commits current state of given files. Merge engine calls it
  with both conflict versions *before* any resolution write.
- **Bootstrap matrix** (never destructive): new empty vault · existing local
  notes (initial commit = full snapshot) · existing remote configured later
  (story 6 handles fetch/merge) · vault already has own `.git` (detect,
  ignore, settings notice).
- **Checkpoint ref is local-only** (e.g. `refs/thinkbrain/checkpoints`),
  never pushed — provider conflict copies must not reach the git remote.
  Main branch stays clean: auto-commit skips unresolved conflict copies.
  Prunable (story 7).
- Idle debounce doubles as file-stability window: skip files modified within
  the window (partial cloud downloads).
- One engine instance per workspace, shared across windows.
- **Repo `.gitignore`:** OS junk (`.DS_Store`, `Thumbs.db`, `desktop.ini`) +
  temp/partials (`*.tmp`, `~$*`, `.~lock*`). Provider conflict copies are NOT
  ignored — checkpointing them is the undo path.

## Acceptance

- [x] Zero files written inside the vault (story 0)
- [ ] Hidden repo keyed by workspace identity and created lazily on open
- [ ] Edits produce commits with correct file sets + template messages
- [ ] `checkpoint()` returns restorable commit; covered by tests
- [ ] All four bootstrap cases covered by tests; own-`.git` vault untouched
- [ ] 10k-file vault: initial snapshot and idle commit stay off the UI thread
- [x] Old system-git code and plans removed

## Status

⬜ Pending.
