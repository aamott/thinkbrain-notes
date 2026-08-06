# Extension Events and Background Tasks

## Status

⬜ Focused child story. Typed event and task contracts are not implemented; lifecycle disposal remains the owner of cleanup.

## Goal

Provide extension-scoped app/extension event subscriptions and abortable background-task registration with deterministic delivery, failure isolation, and disposable ownership.

## Discovery questions and STOP gate

- Which event payloads and delivery/order guarantees are beta-stable?
- Are custom events local-only and namespaced, and is direct extension-to-extension delivery prohibited?
- What task limits, progress reporting, cancellation, restart, and shutdown deadlines are required?

**STOP gate:** Do not freeze payloads, task UX, or implement event/task behavior until API/runtime owners answer these questions and approve the contract and desktop/mobile availability behavior.

## Dependencies

- Lifecycle/bootstrap and typed core contribution conventions.
- `pending-extension_api_surface-low-hard.md` rollup and `pending-extension_contribution_surfaces-low-med.md` only for shared scope/disposable types.
- Native adapters only if an approved event source requires them; no feature-specific sync or AI behavior.

## Likely files

- `packages/core/src/extensions/events.ts`, `tasks.ts`, and tests (likely; paths may be consolidated with existing lifecycle files).
- `apps/desktop/src/extensions/desktopExtensionHost.ts` and extension runtime tests.
- `apps/desktop/src/native/` only for approved typed event sources.

## Small task sequence

1. Record event/task matrix, payload schemas, ordering, and cancellation policy.
2. Implement typed scoped subscription and emit with validation and error isolation.
3. Implement bounded task registration/start/stop with abort on deactivation.
4. Test duplicate IDs, failed activation, shutdown, and no post-dispose delivery.

## Acceptance criteria

- [ ] Events are typed, namespaced, validated, ordered per approved policy, and isolated when a subscriber fails.
- [ ] Tasks are bounded, abortable, and cannot run after deactivation or failed activation.
- [ ] All resources are disposed exactly once and unsupported mobile behavior is explicit.
- [ ] No Git watcher, automatic sync, ACP process, or provider behavior is implemented.

## Automated validation

Run focused core/desktop event-task tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Manual desktop/mobile checks

Desktop: emit fixture events, start/cancel a task, deactivate during work, and verify cleanup/logging. Mobile: exercise shared contracts, app suspension, and explicit unavailable states without desktop PATH/process assumptions.

## Non-goals

No contribution UI, storage, secrets, installer, marketplace, Git sync/watchers, AI/ACP behavior, or sandbox.

## Handoff expectations

Deliver event/task decision matrix, typed contracts, fixture tests, lifecycle resource inventory, cancellation/shutdown report, and unresolved owner decisions. Keep file paths labeled likely.

## References

- `plans/extensions/pending-extension_api_surface-low-hard.md`
- `plans/extensions/pending-extension_lifecycle_bootstrap-low-med.md`
- `plans/extensions/pending-extension_execution_model-low-med.md`
