# Extension AI and Git Feature Hooks

## Status

⬜ Focused child story. Only narrow registration/consumer seams are pending;
AI, Git, and journal behavior remain in their owning epics.

## Goal

Minimal typed extension hooks for AI and Git metadata/background
contributions — no duplicating provider, ACP, history, Git command, watcher,
sync, conflict, or journal behavior.

## Discovery questions (STOP gate)

Which exact AI/Git hook contracts are needed in beta vs deferred? Which owner
supplies each request/result type, capability, cancellation, and error
semantics? What desktop/mobile unavailable behavior and registration ids are
approved?

Do not add feature UI, mockups, native commands, or behavior until the owning
AI/Git epics and the product/API owner approve the hook matrix. A hook must
not become an alternate feature implementation.

## Dependencies

- Extension lifecycle, contribution/event-task contracts, compatibility,
  `beta_builtin_extensions`.
- AI contracts/consent and Git typed adapters as consumer-owned dependencies;
  `plans/ai/` (awaiting planning pass) and `plans/auto-sync/` own behavior.

## Likely files

- `packages/core/src/extensions/featureHooks.ts` + tests (may fold into
  contribution contracts).
- `apps/desktop/src/extensions/desktopExtensionHost.ts` + built-in
  descriptors/tests; owner adapters only at existing typed boundaries.

## Acceptance criteria

- [ ] Hooks are narrow, typed, capability-aware, disposable, owned by the
      correct feature epics.
- [ ] No provider/ACP secret, Git credential, workspace mutation, sync,
      watcher, conflict, or journal behavior crosses the seam.
- [ ] Unsupported mobile capability explicit, never faked as success.
- [ ] Duplicate registration and failed activation clean up without
      affecting unrelated built-ins.

## Validation

Focused core/desktop hook and built-in integration tests, `pnpm lint`,
`pnpm typecheck`, `pnpm build`; manual: fixture AI/Git consumers activate,
delegate to owners, deactivate cleanly on desktop and mobile.

## Non-goals

No AI/Git/journal feature behavior, secret storage, provider gateway, ACP
lifecycle, Git sync/watchers/conflicts, installer, marketplace, UI mockups.

## References

- `extensions/beta_builtin_extensions`, `plans/ai/`, `plans/auto-sync/`
