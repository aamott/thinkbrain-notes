# Branch List + Current Branch

## Goal

Expose read-only local branch metadata and show it in Source Control. This is
branch discovery for the MVP, not branch management or sync.

## Discovery questions — answer before UI work

- Should the panel show only local branches or include detached HEAD and remote
  refs as explicit non-selectable labels? The MVP default is local branches only.
- Where should a long branch list live on narrow/mobile layouts: compact header,
  scrollable list, or a separate view? Define truncation and full-name tooltip rules.
- What copy should an unborn repository, detached HEAD, and a repository with no
  local refs use?

**STOP gate:** Do not create branch mockups or JSX/CSS until these questions are
answered and the narrow/mobile behavior is agreed.

## Implementation-ready acceptance criteria

- [ ] Add serializable Rust `GitBranches { current: Option<String>, branches: Vec<String> }` and `list_git_branches(root_path: String) -> Result<GitBranches, NativeError>` in `apps/desktop/src-tauri/src/commands/git.rs`.
- [ ] Use fixed non-shell commands: `symbolic-ref --quiet --short HEAD` (exit 1 means detached/unborn) and `for-each-ref --format=%(refname:short) refs/heads`; sort/deduplicate deterministically and reject malformed output only as a typed error.
- [ ] Register `list_git_branches` in `apps/desktop/src-tauri/src/commands/mod.rs`; update `apps/desktop/src/native/commands.ts` with `NativeCommandMap` args `{ rootPath: string }`, `NativeGitBranches`, and snake_case fields.
- [ ] Extend `GitCommandName`, `GitDesktopApi.getBranches`, and `GitService.getBranches` in `apps/desktop/src/git/gitService.ts`, with per-root cache invalidated after commit/init and a typed result preserving `NativeCommandError` codes.
- [ ] `SourceControlPanel.tsx` loads branch metadata with status, renders current branch or explicit detached/unborn copy, and renders a bounded scrollable local-branch list. Never imply that clicking a branch switches it.

## Likely files and boundaries

Rust/native: `apps/desktop/src-tauri/src/commands/git.rs`, `commands/mod.rs`,
and `src/tests.rs`; use the existing `GitRunner`, workspace root resolver, and
same timeout/environment. Bridge: `apps/desktop/src/native/commands.ts`.
Frontend adapter/state: `apps/desktop/src/git/gitService.ts` and
`gitService.test.ts`; panel: `SourceControlPanel.tsx` and
`SourceControlPanel.test.tsx`. Shell registry integration is
`apps/desktop/src/panels/panelRegistry.tsx`; do not add a legacy store or `App.tsx`
activity-button path.

## Tests and manual repository setup

- Rust mocked-runner tests assert exact commands, sorting, detached/unborn handling,
  empty branch output, malformed output, non-repo, timeout, and bounded stderr.
  Temp-repo test: `git init`, configure identity, make one commit, create a local
  branch, assert current plus all local names; separately assert `git init` before
  the first commit has no branch ref.
- Vitest tests cover adapter invocation, cache hits/invalidation, loading/error
  states, detached/unborn markup, long names, and mobile-width list behavior.
- Manual setup: use the commit story's temp repository, then `git switch -c
  feature/branch-list` (or `git checkout -b` on older Git), return to the default
  branch, and verify only local branches are listed and current changes after a
  commit refresh the current branch.

## Automated validation

Run Rust mocked/temp-repository and Vitest adapter/panel tests, `pnpm lint`, `pnpm typecheck`, and `cargo test`.

## Manual desktop/mobile checks

Desktop: verify branch list/current/detached/unborn behavior on Windows/Linux/macOS. Mobile: show approved read-only/unavailable state without process-spawn or writable-Git assumptions.

## Handoff expectations

Deliver command/DTO contract, cache invalidation report, UI decision/mockup record, test matrix, and unresolved product questions; concrete file paths remain likely until implementation confirms them.

## Platform, non-goals, and dependency order

- Windows: normalize `\\` only for display and handle localized Git output by
  relying on machine-readable formats; Linux/macOS: test detached HEAD and branch
  names containing hyphens/slashes. Mobile: render read-only/unavailable state and
  do not assume process spawning or writable `.git` access.
- Non-goals: branch create/delete/rename/switch, remote branches, upstream status,
  push/pull, auto-sync, watchers, or conflict resolution.
- Order: availability → repository detection → status → branch command and typed
  errors → commit/stage mutations → panel completion. This story can be developed
  before the commit command but must not enable branch switching.
