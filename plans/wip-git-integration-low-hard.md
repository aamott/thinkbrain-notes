# Git Integration

> **REPLAN NEEDED before implementing any story in this epic.** The current plan
> assumes MVP Git as a direct native implementation with sync as a separate
> extension layer. The new direction: Git sync should replace built-in Git
> entirely so Git is presented as one user-facing feature that hides Git
> complexity from non-technical users. Replan the epic scope, story breakdown,
> and the extension-vs-built-in boundary when this epic is opened for work.

> System Git integration for the active workspace. Read `plans/app-vision.md`
> and `plans/technical-decisions.md` (Git section) before starting any story
> here.

## Goal

Give users basic, reliable version control over their workspace using the
system Git installation — no embedded Git, no provider integrations. The app
shells out to the user's installed `git` binary through the Tauri/Rust native
layer and surfaces status, staging, commits, and branch info in a source-control
sidebar panel.

## Scope

In scope:

- system Git availability check
- repository detection (is the active workspace a Git repo?)
- repository initialization (`git init`)
- status (changed/staged/untracked files)
- stage / unstage files
- commit staged files
- branch list + current branch
- source-control sidebar panel (activity bar + left sidebar)
- VS Code-style inline diff viewer (side-by-side or unified, read-only)
- useful typed errors for common Git failures
- a narrow extension-host registration seam for future Git sync/background tasks

The extension seam is lifecycle/registration only; it does not move Git behavior
out of this epic or make future sync part of the MVP.

Non-goals (deferred or out of scope):

- embedded Git implementation
- Git hosting provider integrations (GitHub, GitLab, etc.)
- advanced conflict-resolution editor (later story)
- cloud sync / built-in automatic sync service (later story)
- file watchers or background status polling (later story)
- push / pull UX polish
- provider integrations and credential UX

## Architecture Decisions

### System Git via the native layer

All Git commands run through the desktop/native (Rust) layer so failures are
captured and reported consistently. This matches the existing pattern: native
Tauri commands in `apps/desktop/src-tauri/src/commands/git.rs`, aggregated through
`commands/mod.rs`, a typed `NativeCommandMap` and `invokeNativeCommand` helper in
`apps/desktop/src/native/commands.ts`, and a thin frontend service that wraps
those typed invocations through the existing `apps/desktop/src/git/gitService.ts`
frontend adapter.

New Git commands are added as new `#[tauri::command]` functions in the Rust
command module and registered through the existing command aggregation; `lib.rs`
remains the builder/entry point. Each gets a matching entry in `NativeCommandMap`
so the frontend stays type-safe.

### Operates on the active workspace

Git commands operate on the active workspace root path only. The fresh shell
owns the active root through its workspace adapter. No Git state is stored
inside the workspace by the app — the app only reads/writes the user's normal
Git repository data (`.git`, working tree). App caches/settings never go in the
workspace (user-data separation rule).

### Error handling

Git integration must fail loudly with useful, typed errors. Reuse the existing
`NativeError` / `NativeCommandError` shape (`code`, `message`, `details`).
Common failure cases get dedicated error codes:

- Git not installed
- workspace is not a repository
- authentication failure
- merge conflict
- command timeout or non-zero exit

### UI

The source-control panel lives in the fresh shell's left popout, selected from
the existing Source Control activity action. The panel and its state must be
rebuilt against the native adapter; no retired desktop store or UI is reused.

## Dependencies

- `workspace-explorer` (done) — provides the active workspace root and file
  tree that Git status annotates.
- desktop shell / project scaffold (done) — Tauri native command bridge,
  `NativeCommandMap`, `NativeError`, activity bar, and sidebar layout all
  exist.

No other epic blocks the basic MVP commands. The extension epic provides shared
lifecycle/contribution infrastructure, while the Git-specific registration seam is
planned in `plans/git-integration/pending-extension_host_registration_seam-high-med.md`.
The beta built-in registration story remains the cross-epic consumer at
`plans/extensions/pending-beta_builtin_extensions-med-med.md`; neither story owns
Git status/staging/commit/diff behavior. Automatic sync, watchers, and conflict
resolution remain later separate Git stories and are not dependencies of MVP.

## Validation

- `cargo test` for Rust Git command wrappers and temporary repositories; keep
  mocked-runner coverage for missing Git, timeout, paths, and non-zero commands.
- Vitest unit tests for typed command-map adapters, status/branch/commit/diff
  parsing, request races, and panel/error states in co-located `*.test.ts(x)`.
- UI-heavy stories require their discovery questions and STOP gate before mockups
  or code; run `pnpm lint`, `pnpm typecheck`, and `pnpm build` after approval.
- Manual/E2E repository matrix: init, identity, staged/unstaged/untracked,
  commit, branch list/detached HEAD, diff, hook failure, non-repo, workspace
  switch, and Git unavailable. Record Windows/Linux/macOS and mobile capability
  outcomes; do not imply automatic sync, watchers, or conflict resolution.

## Status

- ✅ Git availability check
- ✅ Repository detection
- ✅ Repository initialization
- ✅ Git status
- ✅ Stage / unstage files
- ⬜ Commit staged files — `plans/git-integration/pending-commit-high-med.md`
- ⬜ Branch list + current branch — `plans/git-integration/pending-branch_list-high-easy.md`
- ⬜ Source-control sidebar panel completion — `plans/git-integration/pending-source_control_panel-high-med.md`
- ⬜ Typed Git error handling — `plans/git-integration/pending-git_error_handling-high-easy.md`
- ⬜ Read-only inline diff viewer — `plans/git-integration/pending-inline_diff_viewer-high-med.md`
- ⬜ Extension-host registration seam only — `plans/git-integration/pending-extension_host_registration_seam-high-med.md`

Later, explicitly separate and not MVP blockers:

- ⬜ Automatic sync policy — `plans/git-integration/later-automatic_git_sync-high-hard.md`
- ⬜ File watchers/status refresh — `plans/git-integration/later-git_file_watchers-med-hard.md`
- ⬜ Conflict detection/resolution — `plans/git-integration/later-git_conflict_resolution-high-hard.md`

The five foundational stories above are done, but this epic's remaining
integration items are still pending.
