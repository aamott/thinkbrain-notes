- name: settingsImportExport isValueTypeValid duplicates core validation.ts type/range/enum checks
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/settingsImportExport.ts
- lines: 139-164
- description: |
    `isValueTypeValid` (lines 139-164) reimplements the type/range/enum checks
    that already live in `packages/core/src/settings/validation.ts`:
      - `case "boolean": typeof value === "boolean"` ↔ `checkType` lines 87-91
      - `case "number": Number.isFinite + min/max` ↔ `checkType` lines 97-101
        + `checkRange` lines 121-157
      - `case "string": case "path": typeof value === "string"` ↔ `checkType`
        lines 92-114 (including the `path` null sentinel)
      - `case "enum": options.includes(value)` ↔ `checkEnum` lines 160-189

    The two implementations have already drifted: the core `checkType` for
    `path` accepts `null` (the "no path set" sentinel, validation.ts lines
    106-110), but `isValueTypeValid` for `path` (line 152-154) requires a
    string and rejects `null`. An imported `null` path value (legitimate
    "no path") would be counted as a type mismatch by the import flow even
    though the core validator accepts it.

    The import flow does not need a boolean predicate — it could call
    `validateSettings(registry, { [key]: value })` for each imported key (or
    batch all known keys into one call) and treat a non-empty diagnostics
    array as a mismatch. That reuses the canonical validators and eliminates
    the drift. If the per-key call overhead is a concern, batch the known
    keys into one `validateSettings` call after staging and roll back the
    invalid ones — but a per-key call is simpler and the import file is small.

    Fix: replace `isValueTypeValid(def, value)` with
    `validateSettings(appSettingsRegistry, { [def.key]: value }).length === 0`,
    or export the per-definition validator from core and call it. Either way,
    one implementation of the type/range/enum rules.

    Estimated savings: ~25 lines removed from settingsImportExport.ts, plus
    the drift bug fix.
- verification: |
    Read settingsImportExport.ts lines 139-164: the `switch` over
    `def.type` with hand-rolled checks.
    Read validation.ts lines 82-189: `checkType`, `checkRange`, `checkEnum`
    implementing the same rules with the `path` null sentinel (line 108)
    that the import version lacks.
    Grep confirms `validateSettings` is already imported by settingsStore.ts
    (line 26) and dynamic.ts (line 14), so the import path is established.
