# gix Engine + Hidden Repo

Story 1 of `pending-auto_sync-med-hard.md`. Foundation for everything else.
The `gix` dependency, and the hidden repo's separate-worktree layout, are proven
in the gix build spike (completed) — start from `hidden_repo.rs`
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
- [x] Hidden repo keyed by workspace identity (same stable hash the workspace
      settings file uses) and created on first open — `bootstrap.rs`
- [x] Changes are recorded as commits with the right file sets — `snapshot.rs`,
      index-free: blob → tree editor over the last commit's tree → commit, so
      recording costs the paths that changed rather than the whole vault
- [x] Template messages: `Sync <local datetime> — <n> notes changed`
- [x] `checkpoint()` returns a restorable commit, on `refs/thinkbrain/checkpoints`
      rather than a branch, so conflict copies cannot reach a remote
- [x] Bootstrap cases covered: empty vault, vault of existing notes (snapshotted
      whole), reopen (no re-walk), own-`.git` vault untouched. The remote case
      belongs to story 6.
- [x] One engine per workspace, shared across windows, held by window interest
      and released with the last window — the watcher's own lifecycle, reused
- [x] Auto-commit on idle, fed by the watcher rather than the frontend, so a
      vault is recorded while its window is busy or minimised
- [x] Recording runs on a sweeper thread, never a command handler, and holds no
      lock while it hashes
- [x] 10k-file vault measured rather than argued — ignored harness
      `measures_a_ten_thousand_note_vault` in `bootstrap_tests.rs`. Observed
      baseline (Linux x86_64, 2026-08-19, unoptimized test profile): cold
      bootstrap ~592 ms; reopen ~0.9 ms (~640× cheaper); one-file incremental
      ~87 ms (~7× cheaper). Absolute times are machine-local; CI asserts only
      that reopen and incremental stay materially cheaper than cold.
- [x] Old system-git code and plans removed
- [x] History holds the user's own edits, not only what other programs did to
      the vault — see "What the review changed"
- [x] Every kind of file a user keeps beside their notes is recorded, and
      neither consumer walks into `node_modules`, `.git` or a dotfolder
- [x] Closing a workspace records what has not settled yet
- [x] Commits are serialized per engine, and a batch that fails to record is
      tried again rather than dropped

## What the review changed

A review on 2026-08-16 found nineteen things. The largest was not on the list:

**Auto Sync was not recording the user's own work.** Every save through the
app announces itself so the watcher can ignore the echo, and Auto Sync read
from that same list *after* suppression. History therefore held what other
programs did to the vault and nothing the user typed into the app that wrote
it. Echo suppression is now the index's alone.

The review's own highest finding was the mirror of it: closing a window threw
away whatever had not settled. Fixing that made a latent bug reachable —
recording is not compare-and-swap-safe against itself, and the drained paths
were already gone from the pending set, so a failed commit lost them for good.

The rest: bootstrap out from under the global registry lock, a note that
vanishes mid-batch recorded as the deletion it is, vault-relative paths
required to be plain names, and the first snapshot no longer walking into
ignored folders.

## Known gaps

- **The vanished-note branch in `build_tree` is not covered.** It needs a file
  to disappear between two syscalls, which cannot be arranged without a race or
  an injection seam. The branch is three lines and ships untested.
- **The debouncer's wiring is not unit-tested.** That sync is fed `changes.all`
  and the frontend `changes.notes` lives inside the debouncer closure, which no
  test constructs. `Changes` names both fields, and swapping them is what
  caused the bug above.

## Status

🟩 Mechanism, bootstrap, checkpoint, auto-commit, review findings, and the
measured 10k-vault run are done.
