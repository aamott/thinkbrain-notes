- name: `checkType` default branch silently passes unknown setting types; `checkRange` accepts Infinity when no max is set
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings/validation.ts
- lines: 107-108 (also 113-136)
- description: |
    `checkType` (validation.ts:84-109) has a `default: return undefined;`
    branch. `SettingType` is a closed union (`"boolean" | "string" | "number"
    | "enum" | "path"`, types.ts:17), so the default is currently
    unreachable. But if a new `SettingType` variant is added without updating
    `checkType`, values of that type will silently pass validation with no
    diagnostic — a non-exhaustive switch with no compile-time guard.

    Fix: replace `default: return undefined;` with a `never`-based
    exhaustiveness check, e.g.:
      default: {
        const _exhaustive: never = def.type;
        throw new Error(`Unhandled setting type: ${_exhaustive}`);
      }
    or return a `settings.type.unknown` diagnostic. This makes adding a new
    `SettingType` a compile error until `checkType` is updated.

    Related (lines 113-136): `checkRange` only runs the `min`/`max` checks
    that are defined; it does not call `Number.isFinite(value)`. `checkType`
    (line 96) rejects `NaN` but not `Infinity`/`-Infinity`. A `number`
    setting with only `min` (no `max`) will accept `Infinity`, and one with
    only `max` will accept `-Infinity`. Add `if (!Number.isFinite(value))
    return mismatch(...)` at the top of `checkRange` (or in `checkType`'s
    number branch) so infinities are rejected regardless of bounds.

- verification: |
    Read validation.ts (lines 84-136) and types.ts (line 17). Confirmed the
    `default` branch returns `undefined` with no exhaustiveness guard, and
    that `checkType`/`checkRange` reject `NaN` but not `Infinity`.
