# Extension API: Contributions, Events, Tasks, and Data

## Status

🟨 Superseded rollup. Core command/panel/editor/settings contribution contracts and the desktop scoped settings bridge are implemented and tested. Remaining work is split into the four focused child stories below; this file owns no implementation checklist.

## Goal

Keep one index for the trusted same-context API split: contribution surfaces, app/extension events and tasks, extension-owned app-data storage, and AI/Git hooks. Every child keeps registration in the activation disposable scope; feature behavior remains owned by Git, AI, journal/calendar, and other feature epics.

## Discovery questions

- Which menu/context-menu locations, view renderer contract, theme format, and editor action payloads are beta-stable?
- Which payloads/delivery guarantees apply to `note.opened`, `file.saved`, `workspace.switched`, `file.created`, `file.deleted`, and `file.renamed`?
- Are custom events local-only and namespaced, and is extension-to-extension delivery prohibited?
- What task limits, cancellation/restart policy, and progress UI are required?
- Which data operations (JSON/blob/file), quotas, and cleanup rules are required?
- What exact AI/Git hook contracts are needed without duplicating owning epics?

**Stop-and-ask gate:** Do not mock UI, define payloads, or implement a new surface until product/API owners answer the relevant questions. UI-facing work must get panel/menu/view layout and accessibility approval before mockups or React code.

## Prerequisites

- Existing registries in `packages/core/src/contributions.ts`, `apps/desktop/src/commands/`, `panels/`, and `tabs/`.
- Lifecycle/disposable runtime and compatibility results.
- Native workspace/app-data boundaries in `apps/desktop/src/native/` and `src-tauri/src/commands/`.

## Exact likely file areas

- Add `packages/core/src/extensions/events.ts`, `tasks.ts`, `storage.ts` plus tests; export from `packages/core/src/index.ts`.
- Extend `apps/desktop/src/extensions/desktopExtensionHost.ts` with scoped facades and adapters/services under `apps/desktop/src/extensions/`.
- Add native adapters in `apps/desktop/src/native/` and Rust commands only for approved app-data operations.
- UI bindings use `apps/desktop/src/panels/`, `commands/`, `tabs/`, `shell/`, and `settings/` after the layout gate.

## Implementation tasks

1. Route contribution, event/task, storage, and feature-hook work to the focused child story that owns it.
2. Keep this rollup synchronized with child status and cross-references; do not add a second implementation here.
3. Record unresolved API/layout decisions in the owning child handoff.

## Focused child stories

- `pending-extension_contribution_surfaces-low-med.md`
- `pending-extension_events_tasks-low-med.md`
- `pending-extension_data_storage-low-med.md`
- `pending-extension_feature_hooks-low-med.md`

## Acceptance criteria

- [ ] The four focused child stories are linked, status-labeled, and have non-overlapping ownership.
- [ ] No missing API behavior is claimed complete by this rollup.
- [ ] Child handoffs preserve typed, extension-scoped, capability-aware, disposable APIs.
- [ ] AI/Git hooks remain seams only; owning epics remain owners.

## Automated validation

- Core Vitest tests for event/task/storage contracts.
- Desktop integration tests with fake adapters and lifecycle cleanup.
- `pnpm --filter @thinkbrain/core test`; `pnpm --filter @thinkbrain/desktop test -- extension`; then `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Manual desktop/mobile checks

- Desktop: register sample contributions, emit events, start/cancel a task, read/write extension data, and deactivate while resources are active.
- Mobile: verify shared behavior and clear unavailable states for unsupported native hooks; no crash.

## Non-goals

No sandbox, cross-extension direct messaging, provider/Git/journal implementation, marketplace, URL install, or unapproved UI mockups.

## Handoff artifacts

- Separate contracts/adapters/tests, approved payload/layout decisions, capability map, lifecycle resource inventory, sample extension, and deferred-hook list.

## References

- `plans/extensions/done-internal_contribution_points-low-med.md`
- `plans/extensions/done-extension_lifecycle_bootstrap-low-med.md`
- `plans/extensions/pending-extension_secret_storage-med-hard.md`
- `plans/wip-git-integration-low-hard.md`
- `plans/wip-ai-low-hard.md`
