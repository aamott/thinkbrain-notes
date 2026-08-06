# Later: Automatic Git Sync Policy

## Boundary

Deferred beyond basic MVP Git. Define opt-in scheduled/background sync (fetch,
pull, commit/push policy) only after the extension-host seam exists. This story
must not be pulled into Source Control completion, commit, branch, or diff work.

## Discovery and STOP gate

Decide whether automatic sync means fetch-only, pull, push, or a user-configurable
policy; credential ownership; offline behavior; metered-network behavior; and
whether sync is workspace or app scoped. **STOP:** no sync mockups, settings, or
code until policy, consent, credentials, and failure semantics are approved.

## Likely files and boundaries

- Extension/task owner: `apps/desktop/src/extensions/builtins/gitSyncExtension.ts`
  and the extension host seam from `pending-extension_host_registration_seam...`.
- Git domain/native: `apps/desktop/src-tauri/src/commands/git.rs`,
  `commands/mod.rs`, `src/tests.rs`; add only approved typed commands.
- Bridge/adapter: `apps/desktop/src/native/commands.ts`,
  `apps/desktop/src/git/gitService.ts`; new state/settings under `apps/desktop/src/git/`
  and extension-scoped settings, never workspace app caches.
- UI after discovery: Source Control and settings tests/components; no legacy shell.

## Tests/manual/platform

Use a local bare remote or disposable local clone, configured identity and known
branches; test offline, auth failure, rejected non-fast-forward, cancellation, and
restart. Rust mocked runners and temp repos plus Vitest task/state tests are required.
Windows, Linux, macOS need credential/path/network differences documented; mobile
must show unavailable/no process-spawn state. No provider-specific UX until a
separate provider decision.

## Acceptance criteria

- [ ] Later sync policy, consent, credentials, cancellation, and recovery are explicit and approved before implementation.
- [ ] Sync stays outside MVP Source Control and owns no conflict/editor behavior.

## Automated validation

Run mocked native/task tests, disposable-repository integration tests, `pnpm lint`, `pnpm typecheck`, and `cargo test` after approval.

## Manual desktop/mobile checks

Desktop: exercise approved opt-in policy/offline/auth/restart flows on Windows/Linux/macOS. Mobile: verify explicit unavailable/disabled state and no background process assumption.

## Handoff expectations

Deliver policy/threat decision, task/credential boundary, test matrix, and unresolved questions; concrete paths remain likely.

## Non-goals and dependencies

No watchers, conflict editor, silent commits, forced pushes, or credentials in JSON.
Depends on the extension seam, typed errors, branch/status/commit/diff MVP, and an
explicit security/credential decision. This is a later story, not MVP completion.
