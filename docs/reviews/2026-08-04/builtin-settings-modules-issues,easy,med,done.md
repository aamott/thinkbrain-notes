- name: Built-in modules: `as never` cast in appearance validator, redundant hardcoded bounds in editor validator, and misleading "Migrates" comments
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings/modules/appearance.ts
- lines: 39-42 (also editor.ts:30-33, appearance.ts:4-5, editor.ts:4-5)
- description: |
    Three small issues in the built-in modules, grouped because they should be
    fixed together:

    1. appearance.ts:40 uses `THEME_OPTIONS.includes(value as never)` to
       bypass TypeScript's `includes` signature. `as never` is an unsafe
       escape hatch that defeats type checking — it would compile even if
       `value` were a completely unrelated type. The correct pattern is
       `(THEME_OPTIONS as readonly string[]).includes(value as string)` after
       a `typeof value === "string"` guard (which is already present on
       line 40). This is a type-safety gap per global_rules.md ("Avoid `any`
       types; prefer strict types or `unknown`") — `as never` is worse than
       `any` here.

    2. editor.ts:30-33 hardcodes `value >= 10 && value <= 32` in the custom
       `validation`, duplicating the `min: 10, max: 32` declared on lines
       23-24. The registry's `checkRange` already enforces `min`/`max`, so
       this validator is fully redundant AND a DRY violation: changing the
       bounds requires editing two places. Either drop the custom validator
       (relying on `checkRange`) or, if integer-ness is desired, replace the
       body with a `Number.isInteger` check only (see the
       editor-fontsize-integer-not-enforced finding).

    3. appearance.ts:4-5 and editor.ts:4-5 both say "Migrates the legacy
       fixed-shape ... setting into the registry-based system," but neither
       module defines a `SettingMigration` (no `registerMigration` call, no
       migration object exported). The actual v0->v1 migration lives in the
       legacy `settings.ts:73-86`. The comments are misleading — these
       modules only *describe* the migrated shape; they do not perform
       migrations. Reword to "Defines the registry-based schema for ...;
       the v0->v1 migration remains in the legacy persistence layer."

- verification: |
    Read appearance.ts (lines 1-47), editor.ts (lines 1-48), and confirmed
    via grep that neither module exports or registers a `SettingMigration`,
    while settings.ts:73-86 owns the only v0->v1 migration.
