# Beta Built-in Extension Registration Boundaries

## Status

⬜ Not implemented. No bootstrap currently registers journal/calendar, Git sync, or ACP Agent Chat through the extension host. Existing feature behavior remains in its owning epics.

## Goal

Register beta built-ins through shared contribution/lifecycle APIs with canonical namespaces and disposable ownership, without moving domain behavior into this story. Built-ins are trusted app code; there is no third-party install path or separate privilege model.

## Discovery questions

- What final built-in ids and contribution ids should journal/calendar, Git sync, and ACP Agent Chat use?
- Which registrations are real now versus placeholders until the owning feature epic lands?
- Which panel/activity-bar/menu layouts are approved, and should mobile expose compact alternatives?
- What activation events should each use, and what happens when an owning feature is unavailable?
- Which ACP credential and Git/background-task seams are stable enough to register without claiming behavior exists?

**Stop-and-ask gate:** Do not add UI mockups, registration code, or placeholders until owning epics confirm boundaries and product approves desktop/mobile placement. A registration is not feature implementation.

## Prerequisites

- Lifecycle/bootstrap, compatibility, and API contribution contracts.
- Existing internal registries and scoped settings bridge.
- `plans/wip-git-integration-high-hard.md`, `plans/wip-ai-low-hard.md`, and journal/calendar plan if present.
- Native secret story for ACP credential consumers.

## Exact likely file areas

- Add `apps/desktop/src/extensions/builtins/` registration-only modules/tests.
- Wire from `apps/desktop/src/extensions/bootstrap.ts` / runtime; do not put domain logic in `DesktopShell.tsx`.
- Consume `commands/`, `panels/`, `tabs/`, `settings/`, `git/`, and `agent/` seams only after owner confirmation.

## Implementation tasks

1. Collect owner-approved ids, contributions, activation events, capability requirements, unavailable behavior, and mobile placement before coding.
2. Implement journal/calendar registration-only module for approved panels/commands/templates/settings, delegating behavior/storage to its epic.
3. Implement Git sync registration-only module for approved source-control/background-task seams, delegating Git/watch/conflict UX to Git epic.
4. Implement ACP registration-only module for assistant/provider/credential seams, delegating ACP/chat/permission/provider behavior to AI and secret stories.
5. Register all three through one bootstrap; test collision/disposal/failed activation and assert no feature implementation is imported.

## Acceptance criteria

- [ ] Each built-in uses approved ids, metadata, activation events, and disposable scope.
- [ ] Failures are typed and do not strand other built-ins.
- [ ] Journal/Git/AI behavior stays in existing epics.
- [ ] ACP credentials route to native secret storage; no JSON secret path.
- [ ] Desktop/mobile status and unavailable behavior are approved/tested.
- [ ] No installer, manifest loader, privilege model, or marketplace path is added.

## Automated validation

- Desktop integration tests for bootstrap registration, collisions, activation/deactivation, failure isolation, and unavailable states.
- Owning-epic tests remain behavior source of truth.
- `pnpm --filter @thinkbrain/desktop test -- extension`; `pnpm lint`; `pnpm typecheck`; `pnpm build`.

## Manual desktop/mobile checks

- Desktop Tauri: verify approved commands/panels appear, activate/deactivate cleanly, and actions delegate to owners.
- Mobile Tauri: verify compact/unavailable registrations, no terminal/process-spawn calls, and no broken activity-bar layout.

## Non-goals

No journal/calendar, Git sync/conflict, ACP host/chat/provider, secret-store, installer, marketplace, or UI mockup before approval.

## Handoff artifacts

- Owner-approved registration matrix and boundary decision, modules/tests, bootstrap wiring, namespace/disposal report, and explicit deferred behavior list.

## References

- `plans/pending-extensions-low-hard.md`
- `plans/extensions/pending-extension_lifecycle_bootstrap-low-med.md`
- `plans/extensions/pending-extension_api_surface-low-hard.md`
- `plans/extensions/pending-extension_secret_storage-med-hard.md`
- `plans/wip-git-integration-high-hard.md`
- `plans/wip-ai-low-hard.md`
