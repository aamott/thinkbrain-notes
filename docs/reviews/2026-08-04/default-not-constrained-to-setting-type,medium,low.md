- name: `SettingDefinition.default` is typed `unknown`, so a default can mismatch the declared `type` with no compile-time check
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings/types.ts
- lines: 36 (also 29-55)
- description: |
    `SettingDefinition.default: unknown` (types.ts:36) decouples the default
    value from `type`. Nothing at the type level prevents:
      { key: "fontSize", type: "number", default: "16" }   // string default
      { key: "theme",    type: "enum",   default: 0 }       // number default
      { key: "lineWrap", type: "boolean", default: null }   // null default
    These are caught only at runtime IF validation is run over the defaults,
    and `parseDynamicAppSettings` (dynamic.ts:116-125) does NOT call
    `validateSettings` on the merged values, so a bad default flows straight
    into the settings model with no diagnostic. The registry's
    `resolveDefinition` (registry.ts:176-185) also performs no default/type
    consistency check at registration time.

    This is a type-safety gap (global_rules.md: "Avoid `any` types; prefer
    strict types or `unknown`" — `unknown` is preferred over `any` but here
    a constrained type is possible and safer). A discriminated/mapped type
    could tie `default` to `type`, e.g.:
      type SettingDefault<T extends SettingType> =
        T extends "boolean" ? boolean :
        T extends "number" ? number :
        T extends "string" | "enum" | "path" ? string : never;
    and `SettingDefinition` becomes a discriminated union over `type` with
    the corresponding `default` literal type. That is a larger refactor, so
    at minimum add a registry-time runtime check that `typeof def.default`
    matches the declared `type` (and that enum defaults are in `options`).

    Related latent bug: a `path` setting with `default: null` (a natural
    "no path" default) would fail `checkType`'s `path` branch
    (validation.ts:101-106), which requires a string. If/when a path module
    is added, its null default would be reported as invalid whenever
    validation runs over the defaults map. Either allow `path` defaults to be
    `string | null` and teach `checkType` to accept `null` for paths, or
    document that path defaults must be empty-string `""`.

- verification: |
    Read types.ts (lines 29-55), registry.ts (lines 176-185),
    validation.ts (lines 100-106), and dynamic.ts (lines 116-125).
    Confirmed `default` is `unknown`, no registration-time consistency
    check, and `parseDynamicAppSettings` does not validate merged values.
