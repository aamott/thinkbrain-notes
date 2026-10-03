# Vault Git Sync

## Goal

Let a workspace choose where its git-sync authority lives: the hidden repo in
app-data (default) or a `.git` in the vault itself. Vault mode completes the
commit → fetch → merge → push loop inside the user's repository, with
conflicts resolved through the same UI as daemon conflicts.

## Design

- **One authority per workspace**, chosen at onboarding and fixed until an
  explicit migration. The hidden repo always owns snapshots, history, and
  merge bases in both modes — that does not vary.
- **Appdata (default)**: today's behavior — the hidden repo pushes/pulls, so
  the remote is transport and pushed commits are synthetic snapshots. Setup
  copy must say so. If the vault's `.git` configures the same remote, warn:
  two lineages pushing to one remote is a non-fast-forward war.
- **Vault mode**: the app auto-commits the whole vault on the checked-out
  branch (never switches; refuses detached or unborn HEAD), fetches, merges
  through the existing `round` machinery, and pushes. Merge overlaps surface
  as `ConflictCopy` artifacts in the same conflict UI; a resolution write is
  followed by a commit + push round.
- **Daemon warning**: a vault-mode `.git` inside a daemon-synced folder puts
  the authoritative repo inside the blast radius — warn at setup.
  Duplicating the vault repo to app-data is separate deferred work.
- **Recovery**: a mangled workspace `.git` can be rebuilt from adopted
  ancestry + snapshots — content survives, repo metadata (branches, tags,
  hooks) does not. Offer rebuild only if cheap in this story; otherwise
  split it out.
- "Never modify the user's `.git`" remains the rule for *appdata* mode —
  adoption stays read-only there.

## Acceptance Criteria

- Setup offers appdata vs vault with the trade-off in plain copy (transport
  vs natural history; daemon warning when relevant).
- Vault mode end-to-end on a real remote: save → commit → fetch → merge →
  push, always on the checked-out branch, never switching.
- A vault-mode merge conflict lands in the same triage/merge UI as a daemon
  conflict and, once resolved, is committed and pushed.
- Appdata mode: a workspace `.git` sharing the configured remote warns
  rather than silently dual-pushing.
- An existing clone's history is adopted into the hidden repo in both modes
  (existing machinery).

## Files

- `apps/desktop/src-tauri/src/commands/sync/{round,registry,bootstrap,history_source}.rs`
- `apps/desktop/src-tauri/src/commands/sync/{apply,push,network}.rs`
- `apps/desktop/src/sync/` setup and settings surfaces
