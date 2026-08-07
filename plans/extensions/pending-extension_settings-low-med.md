# Extension Settings UI, Persistence, and Uninstall

## Status

🟨 Partially implemented. App-scoped read/write/change subscriptions and schema cleanup are implemented/tested. D45 workspace scope, extension settings UI/E2E, persisted cleanup, and uninstall are not implemented. Secrets are separate.

## Goal

Render approved non-secret extension settings, persist app and workspace scopes outside the vault, and provide safe cleanup. Preserve `extension-${extensionId}` derivation and extension-owned access. D45 requires workspace isolation and observable scoped reads/writes; it does not permit feature-owned storage.

## Discovery questions

- Should settings appear under one Extensions group, per-extension sections, or both?
- Which schema controls/options, validation, descriptions, localization, and unsupported-type state are allowed?
- Does uninstall delete settings immediately, offer keep/remove, or retain a reinstall tombstone?
- How should disabled/incompatible/malformed extensions appear?
- Does extension reset use existing staged single Save behavior?

**Stop-and-ask gate:** This is UI-facing. Do not create mockups, layout, or React code until product approves grouping, copy, controls, mobile layout, accessibility, and uninstall confirmation.

## Prerequisites

- Modular settings registry/store/UI in `apps/desktop/src/settings/` and core settings types.
- App-scoped settings API/tests in `apps/desktop/src/extensions/desktopExtensionHost.ts`.
- Existing workspace identity and workspace-settings serialization boundaries; D45 must reuse them rather than write into the vault.
- Manifest schema, lifecycle/bootstrap, and extension status model.

## Exact likely file areas

- `apps/desktop/src/settings/SettingsNav.tsx`, `SettingsContent.tsx`, `SettingsTab.tsx`, `controlRegistry.ts`, tests/CSS.
- `apps/desktop/src/settings/settingsStore.ts`, `workspaceSettingsSerialization.ts`, and `packages/core/src/settings/`.
- Add uninstall/cleanup service under `apps/desktop/src/extensions/`; native app-data deletion under `apps/desktop/src/native/commands.ts` and `src-tauri/src/commands/settings.rs` only if required.

## Implementation tasks

1. Extend extension settings schemas/context operations with explicit app/workspace scope, keyed through the existing workspace identity; preserve relative extension keys and `extension-${id}` namespaces.
2. Map schemas to the registry with strict validation and malformed-schema diagnostics.
3. Render approved extension sections using existing staged Save/Reset, accessibility, and mobile patterns.
4. Persist outside the vault, preserve unrelated keys, isolate extensions and workspaces, and notify scoped subscribers when the active workspace changes.
5. Implement approved uninstall cleanup, then add E2E for both scopes, malformed/disabled state, save/reset, workspace switching, and cleanup.

## Acceptance criteria

- [ ] Approved accessible desktop/mobile layout and uninstall confirmation exist.
- [ ] Manifest schemas render with typed validation/errors.
- [ ] App and workspace values persist outside the vault; extension and workspace namespaces cannot cross.
- [ ] Scoped get/set/onDidChange behavior resolves the active workspace explicitly, handles no-workspace state, and updates subscribers on workspace change (D45).
- [ ] Uninstall deactivates first and follows keep/remove policy without unrelated deletion.
- [ ] Secrets never enter JSON, workspace, logs, or general UI state.

## Automated validation

- Core/desktop tests for schema validation, app/workspace serialization, no-workspace behavior, workspace switching, namespace isolation, subscriptions, and cleanup.
- Desktop component and Playwright/E2E settings/uninstall tests.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`.

## Manual desktop/mobile checks

- Desktop Tauri: edit/save/reset app and workspace fixtures, switch between two workspaces, restart, inspect no vault change or cross-workspace leakage, then test approved uninstall choices.
- Mobile Tauri: verify scrolling/touch/keyboard accessibility, offline save, and no desktop-only UI.

## Non-goals

No credentials/encryption fallback, installer, marketplace, URL install, feature-specific behavior, or unapproved mockup.

## Handoff artifacts

- Approved UX decision/mockup after gate, schema mapping, UI/E2E tests, persistence/uninstall policy, cleanup report.

## References

- `plans/technical-decisions.md`
- `plans/extensions/pending-extension_secret_storage-med-hard.md`
- `apps/desktop/src/settings/`
