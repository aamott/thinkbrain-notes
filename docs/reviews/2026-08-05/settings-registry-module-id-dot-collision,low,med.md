- name: Module IDs containing dots silently break getDefinition lookup
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings/registry.ts
- lines: 130-136, 225-234
- description: `getDefinition(fullKey)` extracts the module id by calling
  `getModuleIdFromKey`, which slices on the **first** dot
  (`fullKey.slice(0, dot)`). The registry stores modules under their literal
  `module.id`, and `collectSection` composes full keys as `${moduleId}.${def.key}`.

  If a module id ever contains a dot (e.g. `"editor.display"`), the composed
  full key would be `"editor.display.fontSize"`, but `getModuleIdFromKey` would
  return `"editor"`, so `this.modules.get("editor")` returns `undefined` and
  `getDefinition` silently returns `undefined` for every setting in that module.
  The same module's settings would still appear in `getAllDefinitions` and
  `getDefinitionsForSection`, creating an inconsistent lookup surface.

  No validation rejects module ids containing dots at registration time. The
  current built-in modules (`appearance`, `editor`, `settings`, `ws`, `custom`,
  `paths`) avoid dots, but the convention is not enforced. This is a fail-loudly
  violation: a malformed module id is accepted at registration and silently
  breaks key-based lookup later.

  Suggested fix: in `register(module)`, validate that `module.id` does not
  contain a `.` (and ideally enforce a stable format such as
  `[a-z][a-z0-9-]*`) and throw with a clear message, OR change
  `getModuleIdFromKey` to look up the longest matching registered module id.
- verification: Read `packages/core/src/settings/registry.ts` lines 130-136 and
  225-234. Confirmed `getModuleIdFromKey` splits on the first dot only. Confirmed
  via grep that `getModuleIdFromKey` is also consumed by `defaults.ts` and
  `dynamic.ts`, so the silent-failure surface spans multiple consumers.
