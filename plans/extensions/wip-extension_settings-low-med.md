# Extension Settings UI, Persistence, and Uninstall

## Status

🟨 Scoped runtime shipped: app-scoped read/write/subscribe plus D45 workspace
scope — scope is per setting, so one module may hold both (journal folder per
workspace, calendar defaults global). Workspace overrides persist and re-read
on switch; a workspace file cannot override an app-scoped key.
`effectiveSettingValue` is the single precedence path.

Still open: extension settings UI/E2E, persisted cleanup, and uninstall — all
behind the stop-and-ask gate. Secrets are separate
(`extension_secret_storage`).

## Goal

Render approved non-secret extension settings, persist app and workspace
scopes outside the vault, and provide safe cleanup. Preserve
`extension-${extensionId}` namespacing and extension-owned access.

## Open questions (stop-and-ask gate — UI-facing)

Grouping (one Extensions section vs per-extension)? Which controls/options/
validation/localization/unsupported-type states are allowed? Uninstall
policy: delete now, keep/remove choice, or reinstall tombstone? How do
disabled/incompatible/malformed extensions appear? Does reset reuse the
existing staged single-Save behavior?

Do not create mockups, layout, or React code until product approves grouping,
copy, controls, mobile layout, accessibility, and uninstall confirmation.

## Deliberately unsettled

Editing one key at *both* levels (D64's journal root is "app + workspace")
needs scope-aware editing UI — exactly what the gate reserves. Today a
workspace-scoped setting is edited per workspace and falls back to its
default; the storage model does not block a global level later.

## Remaining tasks

1. Map schemas to the settings registry/UI with strict validation and
   malformed-schema diagnostics (`SettingsNav`, `SettingsContent`,
   `controlRegistry`).
2. Render approved extension sections using existing staged Save/Reset,
   accessibility, and mobile patterns.
3. Approved uninstall cleanup (deactivate first; keep/remove policy);
   app-data deletion via native commands only if required.
4. E2E: both scopes, malformed/disabled, save/reset, workspace switching,
   cleanup.

## Acceptance criteria

- [ ] Approved accessible desktop/mobile layout and uninstall confirmation.
- [ ] Manifest schemas render with typed validation/errors.
- [x] App and workspace values persist outside the vault; namespaces cannot
      cross — workspace edits reach the workspace file, not the app file.
- [x] Scoped get/set/onDidChange resolves the active workspace, handles
      no-workspace, updates subscribers on switch (D45);
      `effectiveSettingValue` is the one precedence rule.
- [ ] Uninstall deactivates first and follows keep/remove policy without
      unrelated deletion.
- [ ] Secrets never enter JSON, workspace, logs, or general UI state.

## Validation

Core/desktop tests (schema validation, serialization, no-workspace,
switching, isolation, subscriptions, cleanup); settings/uninstall E2E;
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`.
