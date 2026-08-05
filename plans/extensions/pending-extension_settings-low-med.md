# Extension Settings

## Goal

Provide per-extension non-secret settings through the existing JSON settings
registry. Extension-scoped, namespaced APIs keep values in the OS
application-data/config area, keyed by the canonical lowercase kebab-case
extension id and never inside the workspace. Each settings module id is derived
directly as `extension-${extensionId}`; schemas do not provide their own module
id. The scoped read/write/change-subscription runtime surface is implemented and
covered by desktop tests. Manifest schemas, settings UI/E2E, uninstall cleanup,
and credential storage remain follow-up work. Credentials are not settings:
Rust/native code stores them in the OS secret store through the focused secret
storage story; the encrypted app-data fallback decision remains deferred.

Note: extension *data storage* (caches, indices, conflict metadata) is a
separate concern handled by the extension API surface story. This story covers
only user-configurable settings.

## Acceptance Criteria

- [ ] Each extension can declare a settings schema via its manifest.
- [ ] Extension settings are stored outside the workspace, keyed by the
      canonical extension id, in the OS app-data/config area.
- [ ] Settings UI renders extension settings from the declared schema.
- [x] Extension code reads and writes only its own namespaced settings through
      the scoped API, reusing the existing settings registry.
- [x] Settings change events: extensions can subscribe to changes in their own
      settings, and subscriptions are owned by the activation scope.
- [ ] Credentials use a Rust/native OS secret-store adapter, with encrypted
      app-data fallback where needed; APIs never return bulk/raw cross-extension
      secrets (see `pending-extension_secret_storage-med-hard.md`).
- [x] Deactivating an extension disposes its settings subscriptions and removes
      its runtime settings schema registration.
- [ ] Uninstalling an extension cleans up its persisted settings (or offers to).
- [ ] Unit tests cover schema rendering, secret-store boundaries, and broader
      settings UI/E2E behavior.
- [x] Desktop tests cover scoped read/write, namespace isolation, and change
      events.

## References

- `plans/technical-decisions.md` — Settings section (extension settings deferred until this epic)
- `plans/technical-decisions.md` — Extensions section
- `plans/extensions/pending-extension_secret_storage-med-hard.md` — native
  credential storage boundary and deferred encrypted fallback decision
- `plans/extensions/pending-beta_builtin_extensions-med-med.md` — built-in
  registration consumers
- `packages/core` — settings storage and schema types
- `apps/desktop/src` — scoped settings bridge and settings UI
