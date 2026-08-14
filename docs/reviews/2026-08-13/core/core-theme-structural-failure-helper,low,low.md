- name: parseThemeFile repeats the structural-failure return shape three times
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/theme.ts
- lines: 186-230
- description: `parseThemeFile` has three near-identical early-return blocks for missing/invalid required fields:

  ```ts
  if (name === null) {
    return { theme: null, diagnostics: [{ code: "theme.name.missing", message: "...", severity: "error", path: "name" }] };
  }
  if (base === null) {
    return { theme: null, diagnostics: [{ code: "theme.base.invalid", message: "...", severity: "error", path: "base" }] };
  }
  if (version === null) {
    return { theme: null, diagnostics: [{ code: "theme.version.invalid", message: "...", severity: "error", path: "version" }] };
  }
  ```

  Each block constructs the same `ParseThemeResult` shape with a single error diagnostic. A small helper removes the repetition:

  ```ts
  const structuralFailure = (code: string, message: string, path: string): ParseThemeResult => ({
    theme: null,
    diagnostics: [{ code, message, severity: "error", path }]
  });
  ```

  Then each guard becomes `if (name === null) return structuralFailure("theme.name.missing", "...", "name");`. Used three times, call sites stay readable. Saves ~12 lines.

- verification: Read `theme.ts` lines 154-238. Confirmed all three blocks share the `theme: null` + single-error-diagnostic shape.
- savings: ~12 lines.
