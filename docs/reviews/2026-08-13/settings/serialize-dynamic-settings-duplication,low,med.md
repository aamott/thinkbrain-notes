- name: serializeDynamicAppSettings and serializeDynamicWorkspaceSettings are line-for-line identical except for the scope string
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings/dynamic.ts
- lines: 177-222
- description: |
    `serializeDynamicAppSettings` (packages/core/src/settings/dynamic.ts
    lines 177-222) and `serializeDynamicWorkspaceSettings`
    (apps/desktop/src/settings/workspaceSettingsSerialization.ts lines 58-88)
    are structurally identical. Both:
      1. Parse `existingRawJson` into `base` (try/catch, `isRecord` guard,
         `Object.assign`).
      2. Build `knownSettingKeys` from `registry.getAllDefinitions()` filtered
         by scope.
      3. Delete known setting keys from `base`.
      4. Write new values from `values` into `base` for known keys.
      5. Stamp `base.version = CURRENT_SETTINGS_VERSION`.
      6. Return `JSON.stringify(base, null, 2) + "\n"`.

    The only difference is the scope filter: `def.scope === "app"` (line 200)
    vs `def.scope === "workspace"` (line 75). The body is ~40 lines
    duplicated across two packages.

    Extract a shared core function:

    ```ts
    // packages/core/src/settings/dynamic.ts
    export function serializeDynamicSettings(
      values: Record<string, unknown>,
      registry: SettingsRegistry,
      scope: SettingScope,
      existingRawJson: string | null
    ): string { … }
    ```

    Then `serializeDynamicAppSettings` becomes a one-line delegation
    (`return serializeDynamicSettings(values, registry, "app", existingRawJson)`)
    and `serializeDynamicWorkspaceSettings` (in the desktop package) either
    delegates the same way or is replaced by a direct import of the core
    function. The workspace version currently lives in the desktop package
    for no architectural reason — it has no Tauri or React dependency, only
    `@thinkbrain/core` imports, so it can move to core alongside the app
    version.

    Estimated savings: ~30 lines (one full function body) and one less file
    in the desktop settings folder if `workspaceSettingsSerialization.ts` is
    reduced to just the parse function (or eliminated entirely if the parse
    function also moves to core).

    Note: the parse functions (`parseDynamicAppSettings` vs
    `parseDynamicWorkspaceSettings`) share the "defaults + JSON.parse +
    isRecord + iterate definitions" prefix but diverge — the app version runs
    migrations and validation (dynamic.ts lines 103-157) while the workspace
    version does not. They are not safe to collapse without also unifying the
    migration/validation story, which is a larger change. The serialize
    collapse is safe and mechanical.
- verification: |
    Read dynamic.ts lines 177-222 and workspaceSettingsSerialization.ts
    lines 58-88: the two function bodies are identical except for the scope
    string literal. `workspaceSettingsSerialization.ts` imports only from
    `@thinkbrain/core` (lines 11-16) — no Tauri, React, or desktop-specific
    dependencies — confirming it can live in core.
