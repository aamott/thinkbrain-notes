# Git Conflict Detection and Resolution

> **REPLAN NEEDED:** Git sync should replace built-in Git entirely, not layer on
> top. See `plans/wip-git-integration-low-hard.md` before implementing. Promoted
> from `later-` to `pending-` (medium urgency) per user priority on automatic
> syncing and merge UI.

## Boundary

Advanced conflict detection and three-way resolution UI. MVP may surface a
typed conflict/non-zero error, but must not edit conflict markers, write merge
results, or pretend `git pull` exists.

## Discovery and STOP gate

Decide supported operations (merge/rebase/cherry-pick), marker/encoding handling,
ours/theirs/base presentation, binary/submodule behavior, abort/continue semantics,
and whether users may edit a resolved file in the normal editor. **STOP:** no
conflict mockups, diff code, or resolution commands until these decisions and
recovery guarantees are approved.

## Likely files and boundaries

- Rust/native: `apps/desktop/src-tauri/src/commands/git.rs`, `commands/mod.rs`,
  `src/tests.rs`; introduce narrowly typed status/three-way commands only after
  security review and path validation.
- Bridge: `apps/desktop/src/native/commands.ts`; adapter/state:
  `apps/desktop/src/git/gitService.ts`, new focused conflict model/tests.
- UI: `apps/desktop/src/git/SourceControlPanel.tsx`, new conflict view under
  `apps/desktop/src/git/`, and editor/tab integration only after discovery. No
  conflict behavior in the extension-host seam itself.

## Tests/manual/platform

Create disposable repos with text add/add and modify/modify conflicts, rename/delete,
binary, non-UTF8, rebase/abort states, and interrupted commands. Use Rust mocked
runners/temp repos and Vitest model/UI tests; assert no data loss and safe cancel.
Windows CRLF, Linux/macOS permissions/case sensitivity, and mobile unavailable
behavior must be tested. Manual steps must record backup/recovery and `git status`
assertions before/after each action.

## Acceptance criteria

- [ ] Approved merge/rebase/resolution scope and recovery guarantees precede implementation.
- [ ] No MVP story gains conflict editing, silent overwrite, or pull behavior.

## Automated validation

Run mocked/temp-repository conflict fixtures, UI/model tests, `pnpm lint`, `pnpm typecheck`, and `cargo test` after approval.

## Manual desktop/mobile checks

Desktop: use approved disposable conflict matrix on Windows/Linux/macOS and verify backup/recovery/status before/after. Mobile: show unavailable state without desktop Git assumptions.

## Handoff expectations

Deliver approved iterative desktop/mobile mockups, conflict model/recovery decision, test matrix, and unresolved questions; concrete paths remain likely.

## Non-goals and dependencies

No automatic sync, watchers, hosting auth, forced resolution, or silent overwrite.
Depends on typed errors, inline diff read-only viewer, extension seam, and a separate
merge/recovery design. This story remains later than basic MVP Git.
