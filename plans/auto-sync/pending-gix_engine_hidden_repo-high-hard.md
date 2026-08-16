# gix Engine + Hidden Repo

Story 1 of `wip-auto_sync-med-hard.md`. Foundation for everything else.

## Scope

- Add `gix` dependency (rustls, no OpenSSL). New module
  `src-tauri/src/commands/sync/` (`hidden_repo.rs` first).
- One hidden gix repo per workspace in OS app-data, keyed by workspace
  identity. Created lazily on first workspace open. Tracks vault content;
  vault itself gets no `.git`.
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

- [ ] Hidden repo created lazily; zero files written inside vault
- [ ] Edits produce commits with correct file sets + template messages
- [ ] `checkpoint()` returns restorable commit; covered by tests
- [ ] All four bootstrap cases covered by tests; own-`.git` vault untouched
- [ ] 10k-file vault: initial snapshot and idle commit stay off the UI thread
- [ ] Old system-git code (`git.rs`, `gitService.ts`, `SourceControlPanel.tsx`,
      panel registration, tests) removed; `plans/git-integration/` deleted

## Status

⬜ Pending.
