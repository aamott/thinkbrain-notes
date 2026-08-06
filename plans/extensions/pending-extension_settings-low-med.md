# Extension Settings UI, Persistence, and Uninstall

## Status

🟨 Partially implemented. Scoped read/write/change subscriptions and schema cleanup are implemented/tested in `desktopExtensionHost.ts`. Manifest schemas, settings UI/E2E, persisted namespace cleanup, and uninstall are not implemented. Secrets are separate.

## Goal

Render approved non-secret extension settings in the existing settings tab, persist them through the namespaced JSON registry outside the workspace, and provide safe uninstall cleanup. Preserve `extension-${extensionId}` module derivation and extension-owned access.

## Discovery questions

- Should settings appear under one Extensions group, per-extension sections, or both?
- Which schema controls/options, validation, descriptions, localization, and unsupported-type state are allowed?
- Does uninstall delete settings immediately, offer keep/remove, or retain a reinstall tombstone?
- How should disabled/incompatible/malformed extensions appear?
- Does extension reset use existing staged single Save behavior?

**Stop-and-ask gate:** This is UI-facing. Do not create mockups, layout, or React code until product approves grouping, copy, controls, mobile layout, accessibility, and uninstall confirmation.

## Prerequisites

- Modular settings registry/store/UI in `apps/desktop/src/settings/` and core settings types.
- Scoped settings API/tests in `apps/desktop/src/extensions/desktopExtensionHost.ts`.
- Manifest schema, lifecycle/bootstrap, and extension status model.

## Exact likely file areas

- `apps/desktop/src/settings/SettingsNav.tsx`, `SettingsContent.tsx`, `SettingsTab.tsx`, `controlRegistry.ts`, tests/CSS.
- `apps/desktop/src/settings/settingsStore.ts`, `workspaceSettingsSerialization.ts`, and `packages/core/src/settings/`.
- Add uninstall/cleanup service under `apps/desktop/src/extensions/`; native app-data deletion under `apps/desktop/src/native/commands.ts` and `src-tauri/src/commands/settings.rs` only if required.

## Implementation tasks

1. After the product gate, map manifest schemas to the namespaced registry with strict type/validation checks and malformed-schema diagnostics.
2. Render extension sections using existing controls, staged Save/Reset behavior, focus/keyboard/error semantics, and mobile layout; add component tests.
3. Ensure load/save preserves unrelated JSON keys and persists outside the workspace; test multiple extensions and isolation.
4. Implement uninstall service: deactivate first, remove registrations/data per policy, optionally delete `extension-${id}` settings, and report failures.
5. Add E2E for edit/validate/save/reset, malformed/disabled state, and uninstall confirmation/cleanup.

## Acceptance criteria

- [ ] Approved accessible desktop/mobile layout and uninstall confirmation exist.
- [ ] Manifest schemas render with typed validation/errors.
- [ ] Values persist outside the workspace and cannot cross namespaces.
- [ ] Uninstall deactivates first and follows keep/remove policy without unrelated deletion.
- [ ] Secrets never enter JSON, workspace, logs, or general UI state.

## Automated validation

- Core registry/store tests for schema validation, serialization, isolation, and cleanup.
- Desktop component and Playwright/E2E settings/uninstall tests.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`.

## Manual desktop/mobile checks

- Desktop Tauri: load fixture schema, edit/save/reset, restart, inspect no vault change, uninstall with both choices.
- Mobile Tauri: verify scrolling/touch/keyboard accessibility, offline save, and no desktop-only UI.

## Non-goals

No credentials/encryption fallback, installer, marketplace, URL install, feature-specific behavior, or unapproved mockup.

## Handoff artifacts

- Approved UX decision/mockup after gate, schema mapping, UI/E2E tests, persistence/uninstall policy, cleanup report.

## References

- `plans/technical-decisions.md`
- `plans/extensions/pending-extension_secret_storage-med-hard.md`
- `apps/desktop/src/settings/`
