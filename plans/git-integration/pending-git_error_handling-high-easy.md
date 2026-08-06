# Typed Git Error Handling

## Goal

Make every current MVP Git command fail loudly with stable typed codes, bounded
safe details, and actionable frontend state. This story is a contract/consolidation
pass across availability, detection, init, status, stage/unstage, commit, branch,
and diff; it does not add sync behavior.

## Discovery questions and STOP gate

- Which stderr details may be shown inline versus only behind a diagnostics affordance?
- What retry action is safe for each code, and should missing Git link to install
  documentation or only explain PATH?
- How should authentication and merge-conflict codes be represented when MVP does
  not push/pull or resolve conflicts? They are forward-compatible mapping cases,
  not permission to add those UX flows.

**STOP gate:** For the UI-heavy error presentation, do not make mockups or code
until copy, detail disclosure, retry behavior, and mobile wrapping are agreed.

## Implementation-ready acceptance criteria

- [ ] In `apps/desktop/src-tauri/src/commands/git.rs`, centralize mapping through
  `git_run_error`/`git_command_failed`, using stable codes: `git.not_installed`,
  `git.not_repository`, `git.auth_failed`, `git.conflict`, `git.timeout`,
  `git.command_failed`, `git.invalid_path`, `git.no_paths`, `git.empty_message`,
  and `git.status_parse_failed` as applicable. Preserve exit code and bounded
  stderr/stdout in `NativeError.details`; never include credentials or full env.
- [ ] Keep ordinary `git rev-parse` non-repository detection as a typed negative
  result, while mutations/status/commit/branch/diff map non-repo failures to the
  dedicated code. Make auth/conflict detection conservative and documented; do
  not infer from localized text when an exit/status signal is unavailable.
- [ ] Verify every Git command is registered in `apps/desktop/src-tauri/src/commands/mod.rs`
  and no command is added to `src-tauri/src/lib.rs` directly.
- [ ] Extend `normalizeNativeError` in `apps/desktop/src/native/commands.ts` only
  to preserve `code`, `message`, and optional `details`; add a typed `GitErrorCode`
  union/type guard without weakening `NativeCommandError` to `any`.
- [ ] In `apps/desktop/src/git/gitService.ts`, return discriminated result unions
  that retain code/details for UI and tests. Do not catch-and-relabel all errors as
  generic success; invalidate failed in-flight cache entries as currently done.
- [ ] `SourceControlPanel.tsx` renders safe, actionable error copy with an
  accessible alert, optional bounded details, and retry/initialize affordances
  appropriate to the operation. Errors must not be console-only.

## Likely files and boundaries

Rust: `apps/desktop/src-tauri/src/commands/git.rs`, `error.rs` only if the shared
shape needs a typed helper, `commands/mod.rs`, and `src/tests.rs`.
Frontend bridge: `apps/desktop/src/native/commands.ts` and `commands.test.ts`.
Git adapter/state/UI: `apps/desktop/src/git/gitService.ts`,
`gitService.test.ts`, `SourceControlPanel.tsx`, and
`SourceControlPanel.test.tsx`. No direct Tauri imports from components and no
changes to packages/core for operation-specific errors.

## Tests and manual repository setup

- Rust mocked-runner tests cover missing binary, timeout, I/O failure, non-zero
  command, non-repo, invalid path, empty paths/message, hook failure, auth/conflict
  fixtures, details truncation, and no credential leakage. Assert exact stable code.
- Vitest tests cover normalization from object/string/unknown errors, code/details
  preservation, each discriminated service result, retry rendering, and no
  swallowed failure. Run frontend tests plus `cargo test`.
- Manual repo: prepare a valid repo with local identity and a failing hook; prepare
  a separate non-repo; temporarily remove Git from PATH (PowerShell `$env:Path`,
  POSIX `PATH=...`); use an invalid workspace path and detached HEAD. Verify the
  panel remains truthful and offers only valid actions.

## Automated validation

Run Rust error-mapping and Vitest normalization/UI tests, `pnpm lint`, `pnpm typecheck`, and `cargo test`.

## Manual desktop/mobile checks

Desktop: verify missing Git, non-repo, timeout, hook, invalid path, detached, and safe-details states on Windows/Linux/macOS. Mobile: report typed process-unavailable state without fake success.

## Handoff expectations

Deliver stable error taxonomy, redaction/detail policy, retry/copy decision, test matrix, and unresolved user questions; concrete file paths remain likely until implementation confirms them.

## Platform, non-goals, and dependency order

- Windows: map `git.exe` not-found and CRLF output; Linux/macOS: test PATH,
  permission-denied executable, hook stderr, and locale-independent commands.
  Mobile: expose unsupported process-spawn as a typed capability/unavailable state,
  never a desktop path or fake success.
- Non-goals: authentication UI, push/pull, credential storage, conflict-resolution
  editing, automatic sync, watchers, or changing the shared NativeError wire shape.
- Order: establish this error taxonomy before commit/branch/diff UI; apply it to
  completed commands, then validate commit and branch stories, panel, and diff.
