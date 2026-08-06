# Extension-Host Registration Seam for Git Background Work

## Goal

Expose a typed, disposable registration seam so the trusted built-in Git module can
later register source-control contributions and background sync/watch tasks without
moving Git domain behavior into the extension host. This story wires lifecycle and
ownership only; it does not start a watcher or sync task.

## Boundary and discovery

Confirm the canonical built-in id (`git-sync` versus `git`) and contribution ids for
Source Control panel/commands. Confirm whether background work is an explicit host
registration (`context.backgroundTasks.register`) or a lifecycle-owned callback
factory. Confirm desktop-only capability behavior on mobile.

**STOP gate:** This is not UI-heavy, but do not register a new panel or command
until canonical ids and ownership are agreed with the beta built-in story. Do not
make a Git sync mockup or implement sync as part of this seam.

## Implementation-ready acceptance criteria

- [ ] Add platform-neutral lifecycle contracts in `packages/core/src/lifecycle.ts`
  (or a focused `backgroundTasks.ts` re-exported by `packages/core/src/index.ts`):
  a typed `BackgroundTaskRegistration`/`BackgroundTaskContext` with `register`,
  disposable ownership, task status, and explicit `start/stop` semantics. A task
  must not run after its extension context is deactivated.
- [ ] Extend `DesktopExtensionContext` and scoped context creation in
  `apps/desktop/src/extensions/desktopExtensionHost.ts` with a
  `backgroundTasks` registration surface. Every handle must be added to
  `context.subscriptions`, cleaned on deactivate/failed activation, and reject
  registration after deactivation. Keep command/panel/settings namespace rules.
- [ ] Add or update `apps/desktop/src/extensions/desktopExtensionHost.test.ts` and
  `packages/core/src/lifecycle.test.ts` for registration, duplicate ids, start/stop,
  deactivation cleanup, failed activation cleanup, async stop, and no post-dispose
  execution. If a registry is introduced, add its focused test alongside it.
- [ ] Add a narrowly scoped Git built-in descriptor/bootstrap module (likely
  `apps/desktop/src/extensions/builtins/gitSyncExtension.ts` and a bootstrap file
  under `apps/desktop/src/extensions/`) that registers the agreed Source Control
  panel/command contribution and a no-op/future task factory only if the host API
  needs a registration exemplar. It may depend on `gitService`; it must not own
  Rust command behavior, status parsing, sync policy, or conflict logic.
- [ ] Update `plans/extensions/pending-beta_builtin_extensions-med-med.md` to
  cross-reference this seam and state that the Git feature epic owns behavior.
  Update `plans/pending-extensions-low-hard.md` only if its status/reference needs
  reconciliation; do not claim the beta integration is complete.

## Rust/native boundary and typed command map

No Rust command or `NativeCommandMap` entry is required for this registration seam.
The future built-in may call the already typed adapter in
`apps/desktop/src/git/gitService.ts`; if a later background task needs native
lifecycle handles/events, that must be a separate story with commands added in
`apps/desktop/src-tauri/src/commands/git.rs`, registration in
`commands/mod.rs`, and matching `apps/desktop/src/native/commands.ts` types. Never
call Tauri from `packages/core` or extension host contracts.

## Likely files and tests

Likely files: `packages/core/src/lifecycle.ts`, `packages/core/src/index.ts`,
`packages/core/src/lifecycle.test.ts`; `apps/desktop/src/extensions/desktopExtensionHost.ts`,
`desktopExtensionHost.test.ts`, `extensions/index.ts`, and a new built-in bootstrap
module. Verify panel contribution remains in `apps/desktop/src/panels/panelRegistry.tsx`
and Git behavior remains in `apps/desktop/src/git/gitService.ts`.

Manual test: start with a temp Git repository prepared by the Source Control story;
load/activate the trusted built-in, verify the existing source-control contribution
and command namespace appear once, deactivate/reload, and verify all registrations
and task handles disappear. Repeat on Windows, Linux, and macOS desktop. On mobile,
activate the same webview extension and verify desktop-only task capability is
reported unavailable and no process/watcher starts.

## Automated validation

Run core lifecycle, desktop host/bootstrap, Git seam, and registry tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build`; no sync/watcher command tests belong here.

## Manual desktop/mobile checks

Desktop: activate/deactivate the approved Git registration once and verify disposal on Windows/Linux/macOS. Mobile: verify unavailable background capability and no process/watcher starts.

## Handoff expectations

Deliver owner-approved registration matrix, lifecycle/task contract, disposal/failure report, cross-epic handoff, and unresolved questions; concrete file paths remain likely until implementation confirms them.

## Platform, non-goals, and dependency order

- Windows: disposal must release any future process/handle without assuming POSIX
  signals; Linux/macOS: verify async stop and shutdown ordering. Mobile: same trusted
  JS lifecycle, but process-spawn/background Git capability is unavailable unless a
  later native adapter explicitly supports it.
- Non-goals: Git sync, automatic sync policy, file watchers, polling, conflict
  detection/resolution, push/pull, credentials, provider integration, third-party
  installation, privilege isolation, or new Git UI.
- Order: core disposable lifecycle → desktop scoped host API → lifecycle tests →
  built-in registration/bootstrap → separate later sync/watcher/conflict stories.
  Basic MVP Source Control must remain usable if this seam is not activated.
