# Git File Watchers and Status Refresh

> **REPLAN NEEDED:** Git sync should replace built-in Git entirely, not layer on
> top. See `plans/wip-git-integration-low-hard.md` before implementing. Promoted
> from `later-` to `pending-` (medium urgency).

## Boundary

Background file watching/polling for workspace and `.git` changes. Basic
MVP uses explicit/panel-open refresh only; this story must not add automatic status
refresh while implementing the panel or diff viewer.

## Discovery and STOP gate

Decide native watcher versus extension/webview watcher, debounce/coalescing,
workspace sleep/restart behavior, ignored paths, `.git` lock/index churn, and mobile
battery/privacy limits. **STOP:** no watcher mockup or code until event ownership,
shutdown, and resource limits are approved.

## Likely files and boundaries

- Lifecycle: `packages/core/src/lifecycle.ts` (only if watcher handles need a
  generic disposable), `apps/desktop/src/extensions/desktopExtensionHost.ts` and
  tests.
- Rust/native if chosen: `apps/desktop/src-tauri/src/commands/git.rs` or a new
  focused native module, `commands/mod.rs`, `src/tests.rs`; events must be typed.
- Bridge/state: `apps/desktop/src/native/commands.ts`, `apps/desktop/src/git/gitService.ts`,
  `sourceControlRequestGate.ts`; panel updates stay in `SourceControlPanel.tsx`.
- Avoid adding timers directly to React components; all handles belong to the
  extension/task scope.

## Tests/manual/platform

Use a temp repo and external file edits, index lock, rename/delete, ignored files,
rapid bursts, workspace switch, and shutdown. Test mocked event streams plus Rust
watcher cleanup; verify no stale root updates. Windows/Linux/macOS watcher semantics
and case sensitivity must be covered. Mobile defaults to disabled/unavailable with
no battery-heavy polling.

## Acceptance criteria

- [ ] Watcher ownership, debounce/resource/shutdown policy, and mobile battery/privacy limits are approved before implementation.
- [ ] Explicit refresh remains a truthful fallback and no watcher enters MVP stories.

## Automated validation

Run mocked event-stream/Rust cleanup tests, temp-repository burst/switch fixtures, `pnpm lint`, `pnpm typecheck`, and `cargo test` after approval.

## Manual desktop/mobile checks

Desktop: test external edits, lock churn, bursts, workspace switch, and shutdown on Windows/Linux/macOS. Mobile: verify disabled/unavailable default with no polling.

## Handoff expectations

Deliver approved event/resource decision, lifecycle ownership, test matrix, and unresolved questions; concrete paths remain likely.

## Non-goals and dependencies

No sync, push/pull, conflict resolution, or silent mutation. Depends on the extension
registration seam and stable status/error contracts. Explicit refresh remains a
supported fallback if watcher startup fails; this is a later story.
