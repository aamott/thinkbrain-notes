- name: Section id global uniqueness is assumed but not enforced; duplicate section ids silently lose data
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings/registry.ts
- lines: 110-118 (also 141-169)
- description: |
    `getDefinitionsForSection` (lines 110-118) iterates `moduleOrder` and
    returns the first module's bucket for a section id, with the comment
    "Section ids are globally unique by convention (e.g. "editor.display")."
    That convention is NOT enforced by `register`/`collectSection`. If two
    modules (e.g. a built-in and an extension) both register a section with
    id `"editor.display"`, the second module's definitions for that section
    are stored in its own `bySection` map but never returned by
    `getDefinitionsForSection` — only the first-registered module's bucket
    wins. This is silent data loss with no diagnostic.

    Contrast with key uniqueness: `collectSection` (lines 151-155) throws on
    duplicate full setting keys, and module id uniqueness throws (lines 69-73).
    Section id uniqueness should get the same treatment, or
    `getDefinitionsForSection` should aggregate buckets across all modules
    (returning `[][]` flattened) so duplicates are merged rather than dropped.

    Fix: either (a) throw on duplicate section id across modules in
    `collectSection`, mirroring the key-uniqueness guard, or (b) change
    `getDefinitionsForSection` to concatenate every module's bucket for that
    id in registration order. Option (a) is safer given the "globally unique
    by convention" claim.
- verification: |
    Read registry.ts (lines 110-118, 141-169). Confirmed no uniqueness check
    on `section.id` and that the first-match return short-circuits later
    modules' buckets.
