# Extension AI and Git Feature Hooks

## Status

⬜ Focused child story. Only narrow registration/consumer seams are pending; AI, Git, and journal behavior remain in their owning epics.

## Goal

Define minimal typed extension hooks for AI and Git metadata/background contributions without duplicating provider, ACP, history, Git command, watcher, sync, conflict, or journal behavior.

## Discovery questions and STOP gate

- Which exact AI/Git hook contracts are needed in beta, and which are deferred?
- Which owner supplies each request/result type, capability, cancellation, and error semantics?
- What desktop/mobile unavailable behavior and registration IDs are approved?

**STOP gate:** Do not add feature UI, mockups, native commands, or behavior until owning AI/Git epics and the product/API owner approve the hook matrix. A hook must not become an alternate feature implementation.

## Dependencies

- Extension lifecycle, contribution/event-task contracts, compatibility, and beta built-in registration.
- AI contracts/consent and Git typed adapters/error stories as consumer-owned dependencies.
- `plans/wip-ai-low-hard.md` and `plans/wip-git-integration-low-hard.md` remain behavior owners.

## Likely files

- `packages/core/src/extensions/featureHooks.ts` and tests (likely; may remain in contribution contracts).
- `apps/desktop/src/extensions/desktopExtensionHost.ts` and built-in descriptors/tests.
- AI/Git owner adapters only at existing typed boundaries; no direct Tauri calls from core.

## Small task sequence

1. Collect owner-approved hook matrix, IDs, capability requirements, and unavailable behavior.
2. Define opaque typed request/result/cancellation contracts with disposable ownership.
3. Register consumer seams through the host and prove owner delegation.
4. Test collisions, disposal, failure isolation, and no-duplicate behavior.

## Acceptance criteria

- [ ] Hooks are narrow, typed, capability-aware, disposable, and owned by the correct feature epics.
- [ ] No provider/ACP secret, Git credential, workspace mutation, sync, watcher, conflict, or journal behavior crosses this seam.
- [ ] Unsupported mobile capability is explicit and never faked as success.
- [ ] Duplicate registration and failed activation clean up without affecting unrelated built-ins.

## Automated validation

Run focused core/desktop hook and built-in integration tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Manual desktop/mobile checks

Desktop: activate fixture AI/Git consumers, verify one registration each, delegate to owner adapters, and deactivate cleanly. Mobile: verify unavailable capabilities and no process/network/secret call outside approved owner adapters.

## Non-goals

No AI/Git/journal feature behavior, secret storage, provider gateway, ACP lifecycle, Git sync/watchers/conflicts, installer, marketplace, or UI mockups.

## Handoff expectations

Deliver owner-approved hook matrix, typed seam/tests, capability/disposal report, and cross-epic handoff notes. Keep concrete paths labeled likely until implementation confirms them.

## References

- `plans/extensions/pending-beta_builtin_extensions-med-med.md`
- `plans/wip-ai-low-hard.md`
- `plans/wip-git-integration-low-hard.md`
