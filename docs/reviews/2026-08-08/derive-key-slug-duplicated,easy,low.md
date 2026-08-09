- name: deriveKey / deriveFieldKey slug logic duplicated across AddFieldRow and JournalFieldDefinitionsControl
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/AddFieldRow.tsx
- lines: 23-30
- description: |
    `AddFieldRow.deriveKey` and `JournalFieldDefinitionsControl.deriveFieldKey`
    are byte-for-byte identical implementations of the same slugify rule:
    ```ts
    function deriveKey(label: string): string {
      const slug = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      return /^[0-9]/.test(slug) ? `f-${slug}` : slug;
    }
    ```
    Both are used to derive a frontmatter key from a user-typed label (D49's
    rule). Duplicating the rule means a future change (e.g., handling
    non-ASCII labels, or a different digit-prefix strategy) must be made in two
    places, and the two can silently drift — the field a user names on an entry
    (`AddFieldRow`) would then derive a different key than the same name in
    Settings (`JournalFieldDefinitionsControl`), breaking the D85 promotion
    path where a key invented on an entry is later promoted to a configured
    field. The slugifier should live in `packages/core/src/journal/` (e.g.,
    `frontmatter.ts` next to `FIELD_ID_PATTERN`) so both call sites import one
    canonical implementation.
- verification: |
    Read `AddFieldRow.tsx` lines 23-30 and
    `JournalFieldDefinitionsControl.tsx` lines 48-57. Confirmed identical
    function bodies. Both reference D49 in their docstrings. No shared slug
    helper exists in `packages/core/src/journal/` (checked `frontmatter.ts`,
    `types.ts`, `index.ts`).
