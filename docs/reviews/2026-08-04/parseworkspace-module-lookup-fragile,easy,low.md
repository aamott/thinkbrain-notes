- name: parseDynamicWorkspaceSettings/serialize module lookup via indexOf(".") is fragile
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/settingsStore.ts
- lines: 177, 207 (also packages/core/src/settings/dynamic.ts:118, 168)
- description: |
    Both `parseDynamicWorkspaceSettings` (settingsStore.ts:177) and `serializeDynamicWorkspaceSettings` (settingsStore.ts:207), and the core `parseDynamicAppSettings` (dynamic.ts:118) / `serializeDynamicAppSettings` (dynamic.ts:168), resolve a setting's module by:
    ```
    const module = registry.getModule(def.key.slice(0, def.key.indexOf(".")));
    ```
    This assumes the module name is everything before the FIRST `.`. If a setting key ever contains a dot in the module segment (e.g. a namespaced module like `my.extension.theme`), `indexOf(".")` would slice to `my`, not `my.extension`, and `getModule("my")` would return undefined — silently dropping the setting from the parsed/serialized set.

    The registry presumably guarantees keys of the form `module.setting`, so this works today, but it's an implicit contract enforced by string surgery in four places. A `registry.getModuleForSetting(key)` helper (or storing the module id on the definition) would centralize this and remove the fragility.

    Minor maintainability issue, not a current bug.

- verification: |
    Read settingsStore.ts:177 and 207 — both use def.key.slice(0, def.key.indexOf(".")).
    Read dynamic.ts:118 and 168 — identical pattern in core.
    No registry API used to resolve module from a full key; relies on the single-dot convention.
