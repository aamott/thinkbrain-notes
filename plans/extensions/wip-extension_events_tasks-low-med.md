# Extension Events and Background Tasks

## Status

🟨 App-event subscriptions shipped; custom extension-emitted events and
background tasks remain. `packages/core/src/extensions/events.ts` has the
typed bus with listener-failure isolation; `apps/desktop/src/events/appEvents.ts`
defines the beta map (`note.opened`, `note.saved`, `note.created`,
`workspace.opened`); `context.events.on()` scopes subscriptions to the
activation disposable scope.

## Goal

Extension-scoped app/extension event subscriptions and abortable
background-task registration: deterministic delivery, failure isolation,
disposable ownership.

## Open questions (STOP gate)

Which event payloads and ordering guarantees are beta-stable? Are custom
events local-only/namespaced with direct extension-to-extension delivery
prohibited? What task limits, progress reporting, cancellation, restart, and
shutdown deadlines are required? Do not freeze payloads or implement
event/task behavior until owners approve.

## Remaining tasks

1. Record event/task matrix: payloads, ordering, cancellation policy.
2. Custom namespaced extension events (emit + subscribe).
3. Bounded task registration/start/stop, abort on deactivation.
4. Tests: duplicate IDs, failed activation, shutdown, no post-dispose delivery.

## Likely files

- `packages/core/src/extensions/` `events.ts` (exists), `tasks.ts` + tests.
- `apps/desktop/src/extensions/desktopExtensionHost.ts` + runtime tests.

## Acceptance criteria

- [x] App events are typed, scoped to the activation, and isolated when a
      subscriber fails (`note.opened`/`saved`/`created`, `workspace.opened`).
- [ ] Custom extension events are namespaced and validated per approved policy.
- [ ] Tasks are bounded, abortable, cannot run after deactivation/failure.
- [ ] All resources disposed exactly once; mobile gaps explicit.
- [ ] No Git watcher, auto-sync, ACP process, or provider behavior.

## Validation

Focused core/desktop event-task tests, `pnpm lint`, `pnpm typecheck`,
`pnpm build`; manual: fixture events, task start/cancel, deactivate mid-work.
