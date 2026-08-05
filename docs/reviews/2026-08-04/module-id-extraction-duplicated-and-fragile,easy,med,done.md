- name: Module-id extraction `def.key.slice(0, def.key.indexOf("."))` is duplicated in defaults.ts and dynamic.ts while registry.ts keeps a private `splitFullKey`
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings/defaults.ts
- lines: 31 (also dynamic.ts:118, dynamic.ts:168, registry.ts:187-191)
- description: |
    Three places extract the module id from a resolved full key by slicing on
    the first dot:
      defaults.ts:31   `def.key.slice(0, def.key.indexOf("."))`
      dynamic.ts:118   `def.key.slice(0, def.key.indexOf("."))`
      dynamic.ts:168   `def.key.slice(0, def.key.indexOf("."))`
    Meanwhile `registry.ts:187-191` already has a `splitFullKey` helper that
    handles the no-dot case (`dot === -1 ? fullKey : fullKey.slice(0, dot)`),
    but it is module-private and not reused.

    The duplicated inline form has a latent bug: if a full key ever has no dot,
    `indexOf(".")` returns -1 and `slice(0, -1)` strips the last character
    (e.g. `"editor"` -> `"edito"`), producing a wrong module id that silently
    misses the module lookup. The registry currently always composes keys with
    a dot so this does not fire today, but the inline duplication is fragile
    and bypasses the safer helper.

    Additionally, all three call sites re-derive the module id and call
    `registry.getModule(...)` per definition just to filter by scope. The
    registry already knows each definition's owning module; a single
    `getDefinitionsByScope(scope)` (or having `getAllDefinitions` return
    `{def, module}` pairs) would remove the per-def `getModule` lookup and the
    string slicing entirely.

    Fix: expose `splitFullKey` (or a `getModuleForDefinition` /
    `getDefinitionsByScope` API) on the `SettingsRegistry` interface and use it
    in defaults.ts and dynamic.ts; delete the inline slices.
- verification: |
    Read defaults.ts (line 31), dynamic.ts (lines 118, 168), and registry.ts
    (lines 102-108, 187-191). Confirmed `splitFullKey` is private and the
    inline slice is duplicated in three call sites with no no-dot guard.
