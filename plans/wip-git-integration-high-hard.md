# Git Integration

> System Git integration for the active workspace. The next MVP epic to
> implement. Read `plans/app-vision.md` and `plans/technical-decisions.md`
> (Git section) before starting any story here.

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
- VS Code-style inline diff viewer (side-by-side or unified)
- useful errors for common Git failures

Non-goals (deferred or out of scope):

- embedded Git implementation
- Git hosting provider integrations (GitHub, GitLab, etc.)
- advanced conflict-resolution editor
- cloud sync / built-in sync service
- push / pull UX polish
- diff viewing (may be added later as a follow-up; not required for this epic)

## Architecture Decisions

### System Git via the native layer

All Git commands run through the desktop/native (Rust) layer so failures are
captured and reported consistently. This matches the existing pattern: native
Tauri commands in `apps/desktop/src-tauri/src/lib.rs`, a typed
`NativeCommandMap` and `invokeNativeCommand` helper in
`apps/desktop/src/native/commands.ts`, and a thin frontend service that wraps
the typed invocations (mirroring `workspaceService.ts` / `searchService.ts`).

New Git commands are added as new `#[tauri::command]` functions in the Rust
layer and registered in the `tauri::generate_handler![]` list. Each gets a
matching entry in `NativeCommandMap` so the frontend stays type-safe.

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

No other epic blocks this one.

## Validation

- `cargo test` for Rust Git command wrappers (use a temporary repository).
- Vitest unit tests for the frontend Git service (status parsing, error
  mapping) — co-located `*.test.ts`.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- Manual / E2E: open a workspace, init a repo, view status, stage, commit.

## Status

- ✅ Git availability check — see
  `plans/git-integration/done-git_availability_check-high-easy.md`
- ✅ Repository detection — see
  `plans/git-integration/done-repo_detection-high-easy.md`
- ✅ Repository initialization — see
  `plans/git-integration/done-repo_init-high-easy.md`
- ✅ Git status — see `plans/git-integration/done-git_status-high-med.md`
- ✅ Stage / unstage files — see
  `plans/git-integration/done-stage_unstage-high-med.md`
- ⬜ Commit staged files
- ⬜ Branch list + current branch
- ⬜ Source-control sidebar panel — activity bar entry + left sidebar panel
- ⬜ Git error handling — useful typed errors for common Git failures
- ⬜ VS Code-style diff viewer — side-by-side or unified inline diff for changed files
