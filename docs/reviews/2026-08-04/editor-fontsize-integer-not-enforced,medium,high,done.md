- name: Dynamic system does not enforce integer font size, diverging from legacy behavior; non-integer values like 16.5 pass validation
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings/modules/editor.ts
- lines: 20-33 (also validation.ts:113-136)
- description: |
    The legacy `readEditorFontSize` (settings.ts:345-367) requires
    `Number.isInteger(value)` in addition to the 10-32 range; a non-integer
    like `16.5` is rejected and replaced with the default. The dynamic
    `editorModule` (editor.ts:20-33) declares `type: "number", min: 10,
    max: 32` and a custom `validation` that checks `value >= 10 && value <=
    32` — but neither the registry's `checkRange` (validation.ts:113-136)
    nor the custom validator checks `Number.isInteger`. So `editor.fontSize =
    16.5` passes dynamic validation and gets persisted, while the same value
    would be rejected by the legacy parser. This is a behavioral
    inconsistency between the two coexisting systems that the dynamic module
    claims to migrate from (editor.ts:4-5).

    Separately, `checkRange` also does not reject `Infinity` / `-Infinity`
    (only NaN is rejected in `checkType`, validation.ts:96). With `min: 10`
    set, `-Infinity` is caught by the min check, but `Infinity` passes the
    max check only if `max` is set; a number setting with no `max` would
    accept `Infinity`. Worth a `Number.isFinite` guard in `checkRange`.

    Fix: either add `Number.isInteger` to the editor module's custom
    `validation` (and document that integer-ness is a module-specific rule),
    or — better — extend `SettingDefinition` with an `integer?: boolean` flag
    honored by `checkRange` so the constraint is declarative and reusable.
    Add `Number.isFinite(value)` to `checkRange` to reject infinities.
- verification: |
    Read editor.ts (lines 20-33), validation.ts `checkRange` (lines 113-136)
    and `checkType` (lines 95-99), and the legacy `readEditorFontSize`
    (settings.ts:345-367). Confirmed the legacy path requires
    `Number.isInteger` while the dynamic path does not, and that
    `checkRange` lacks a `Number.isFinite` guard.
