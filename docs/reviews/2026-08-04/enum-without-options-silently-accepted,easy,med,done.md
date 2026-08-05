- name: An `enum` setting with no `options` silently accepts any string; `checkEnum` returns no diagnostic
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings/validation.ts
- lines: 139-155 (also types.ts:53-54)
- description: |
    `checkEnum` (validation.ts:143) early-returns `undefined` when
    `!def.options`, so an `enum` definition that forgot to declare `options`
    accepts every string value with no diagnostic. `types.ts:53-54` declares
    `options?: readonly string[]` as optional, so this is a legal-but-buggy
    definition. There is also no registry-time check that an `enum` definition
    actually supplies `options` (registry.ts `resolveDefinition`, lines
    176-185, just spreads the def).

    This is a definition-time bug that silently becomes a runtime acceptance
    of arbitrary strings — exactly the kind of thing a settings schema layer
    should catch loudly (global_rules.md "Fail loudly").

    Fix: in `checkEnum`, when `def.type === "enum"` and `def.options` is
    missing or empty, emit a diagnostic such as
    `code: "settings.enum.no_options", message: "Enum setting \"<key>\" has
    no allowed options; value cannot be validated."` so the misconfiguration
    is visible. Optionally also guard in `registry.resolveDefinition` /
    `collectSection` and throw on `type === "enum" && (!def.options ||
    def.options.length === 0)` at registration time, mirroring the duplicate-
    key throw.
- verification: |
    Read validation.ts (lines 139-155) and types.ts (lines 53-54); confirmed
    `options` is optional and `checkEnum` returns `undefined` when it is
    absent. Read registry.ts (lines 176-185) and confirmed no enum-options
    guard at registration.
