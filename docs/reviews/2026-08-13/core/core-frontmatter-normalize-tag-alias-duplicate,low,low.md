- name: normalizeTagName and normalizeAlias near-duplicate
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/frontmatter.ts
- lines: 294-302
- description: The two normalizers differ only by a leading-`#` strip:

  ```ts
  function normalizeTagName(value: string): string | null {
    const trimmed = value.trim().replace(/^#+/, "");
    return trimmed.length > 0 ? trimmed : null;
  }
  function normalizeAlias(value: string): string | null {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  ```

  Both are called once, from `normalizeStringList` (lines 158-159). A single helper with an optional strip regex removes the duplication:

  ```ts
  function normalizeStringItem(value: string, strip?: RegExp): string | null {
    const trimmed = strip ? value.trim().replace(strip, "") : value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  ```

  Then `normalizeStringList(..., normalizeStringItem)` and `normalizeStringList(..., (v) => normalizeStringItem(v, /^#+/))`. Used twice, call sites stay readable. Saves ~3 lines.

- verification: Read `frontmatter.ts` lines 158-159 (call sites) and 294-302 (definitions). Grepped `normalizeTagName|normalizeAlias` — only the two call sites in `frontmatter.ts`.
- savings: ~3 lines.
