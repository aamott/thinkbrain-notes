# Commit Staged Files

> **REPLAN NEEDED:** Git sync should replace built-in Git entirely, not layer on
> top. See `plans/wip-git-integration-low-hard.md` before implementing.

## Goal

Add the smallest reliable commit flow to the existing Source Control panel: commit
only the files already staged by this app, then reload status and branch metadata.
This is basic local MVP Git, not synchronization.

## Discovery questions — answer before UI work

- Should the message field use one subject line or allow a multi-line body? Preserve
  newlines only if the native command contract explicitly supports them.
- Should a successful commit clear focus, keep the message, or clear it? What is the
  keyboard shortcut and accessible name for the action?
- How should a commit hook that writes output but fails be presented: inline details,
  expandable stderr, or a retry action?
- Do staged renames/deletions need a confirmation affordance, or is the existing
  stage state sufficient?

**STOP gate:** Do not make mockups, JSX, CSS, or screenshots until the questions
above have an agreed answer. After the answer, implement against the current shell
and panel registry; do not revive retired `appStore`/`styles.css` paths.

## Implementation-ready acceptance criteria

- [ ] Rust adds `commit_git_files(root_path: String, message: String) -> Result<GitCommitResult, NativeError>` in `apps/desktop/src-tauri/src/commands/git.rs`; validate non-empty/trimmed message and execute fixed `git commit --file=- --` with the message on stdin (never interpolate it into a shell string).
- [ ] `GitCommitResult` is serializable and contains the new commit id and summary, or choose and document a result with no secrets; stderr/stdout are bounded by the existing 4 KiB detail limit.
- [ ] Register the command in `apps/desktop/src-tauri/src/commands/mod.rs` (`app_command_handlers!`); `src-tauri/src/lib.rs` remains only the builder entry point.
- [ ] Add `commit_git_files` to `NativeCommandMap` in `apps/desktop/src/native/commands.ts`, including exact args `{ rootPath: string; message: string }` and a typed result interface using Rust snake_case response fields.
- [ ] Extend `GitCommandName`, `GitDesktopApi.commit`, `GitService.commit`, and cache invalidation in `apps/desktop/src/git/gitService.ts`; preserve `NativeCommandError` rather than converting every failure to a generic success.
- [ ] `SourceControlPanelState` in `apps/desktop/src/git/SourceControlPanel.tsx` gains message/committing/success/error state without losing stale status during a request. Disable commit for no staged entries, blank/whitespace-only message, or an in-flight request.
- [ ] On success refresh status and branch through the adapter, show a non-assertive success message, and clear the message only after the commit is confirmed. On empty commit, hook failure, identity failure, or non-repo, show actionable typed error copy and bounded details where safe.

## Likely files and boundaries

- Rust/native: `apps/desktop/src-tauri/src/commands/git.rs`, `commands/mod.rs`,
  and `src/tests.rs`; use `GitRunner`, workspace-root/path validation, timeout,
  `GIT_TERMINAL_PROMPT=0`, and `NativeError`.
- Bridge: `apps/desktop/src/native/commands.ts` only; no component calls Tauri.
- Adapter/state/UI: `apps/desktop/src/git/gitService.ts`, `gitService.test.ts`,
  `SourceControlPanel.tsx`, `SourceControlPanel.test.tsx`; shell routing remains
  in `panels/panelRegistry.tsx` and `panels/LeftPopout.tsx`.

## Tests and manual repository setup

- Rust mocked-runner tests assert stdin-safe commit arguments, empty-message
  rejection, success result, non-zero hook/identity failure, bounded details, and
  path-root/timeout behavior. Add a temp-repository integration test with
  `git init`, configured local `user.name`/`user.email`, staged file, commit, and
  `git rev-parse HEAD` assertion; clean the temp directory.
- Vitest tests cover command-map invocation, cache invalidation, disabled states,
  success refresh, and typed error rendering. Run `pnpm exec vitest run
  apps/desktop/src/git` and `cargo test` from `apps/desktop/src-tauri`.
- Manual repo: create `git init`, `git config user.name Test`, `git config
  user.email test@example.invalid`, create/edit/delete/rename a note, stage one,
  leave one unstaged, commit, verify `git status --short` is clean for the staged
  file and `git log -1 --format=%s` matches. Also run a failing `pre-commit` hook.

## Automated validation

Run Rust mocked/temp-repository and Vitest command/panel tests, `pnpm lint`, `pnpm typecheck`, and `cargo test`.

## Manual desktop/mobile checks

Desktop: verify staged-only commit, identity/hook/empty/error states on Windows/Linux/macOS. Mobile: compile/render approved unavailable state without invoking unsupported system Git.

## Handoff expectations

Deliver stdin-safe command contract, typed error/cache report, approved message UX record, test matrix, and unresolved questions; concrete file paths remain likely until implementation confirms them.

## Platform, non-goals, and dependency order

- Windows: use `git.exe` through `Command`, test CRLF and paths with spaces; Linux:
  test missing identity and executable hooks; macOS: test Xcode/Homebrew Git path
  and hook output. Mobile Tauri builds must compile with the feature gated/unavailable
  state; do not invoke system Git where no supported process-spawn capability exists.
- Non-goals: amend, sign, push/pull, commit templates, provider auth, auto-sync,
  watchers, conflict resolution, or staging/unstaging redesign.
- Order: availability → repository detection → status → stage/unstage (done) →
  typed error mapping → this commit story → branch metadata/panel completion.
  The extension-host seam is independent registration work and must not block this
  local commit flow.
