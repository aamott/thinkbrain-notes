# Extension Settings

## Goal

Provide per-extension settings that integrate with the existing JSON settings
system. Extension settings are the third settings level (after application and
workspace settings) and live in the OS application-data/config area, keyed by
extension id, never inside the workspace. This aligns with the project principle
of storing metadata separate from the repo to avoid sync conflicts with OneDrive
and SyncThing.

Note: extension *data storage* (caches, indices, conflict metadata) is a
separate concern handled by the extension API surface story. This story covers
only user-configurable settings.

## Acceptance Criteria

- [ ] Each extension can declare a settings schema via its manifest.
- [ ] Extension settings are stored outside the workspace, keyed by extension
      id, in the OS app-data/config area.
- [ ] Settings UI renders extension settings from the declared schema.
- [ ] Extension code reads its settings through the scoped API.
- [ ] Settings change events: extensions can subscribe to changes in their own
      settings.
- [ ] Uninstalling an extension cleans up its settings (or offers to).
- [ ] Unit tests cover schema rendering, read/write, key isolation between
      extensions, and change events.

## References

- `plans/technical-decisions.md` — Settings section (extension settings deferred until this epic)
- `plans/technical-decisions.md` — Extensions section
- `packages/core` — settings storage and schema types
- `apps/desktop/src` — settings UI
