- name: Dead HOST_API_VERSION re-export and duplicated diagnostic-to-reason mapping in bootstrap
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/bootstrap.ts
- lines: 49, 185-189, 273-277
- description: |
    Two compaction opportunities:

    1. **Dead re-export** (line 49): `export { HOST_API_VERSION } from
       "./hostCompatibility";` is imported by nothing. A repo-wide grep for
       `HOST_API_VERSION` shows the only consumers are `hostCompatibility.ts`
       (definition) and this re-export; `bootstrap.ts` itself uses
       `HOST_COMPATIBILITY`, not `HOST_API_VERSION`. The re-export can be deleted.

    2. **Duplicated diagnostic mapping** (lines 185-189 and 273-277): the same
       `diagnostics.map((d) => ({ code: d.code, message: d.message, severity:
       d.severity }))` block appears verbatim twice — once for failed built-in
       manifests and once in `addLocalExtension`. Both convert
       `ManifestDiagnostic[]` to `BootstrapReason[]`. Extract a `toReasons`
       helper used at both sites:
       ```ts
       const toReasons = (diagnostics: readonly ManifestDiagnostic[]): readonly BootstrapReason[] =>
         diagnostics.map((d) => ({ code: d.code, message: d.message, severity: d.severity }));
       ```
- verification: |
    `grep` for `HOST_API_VERSION` across the repo: only `hostCompatibility.ts`
    (definition) and `bootstrap.ts` (re-export) match; no importer. The two
    mapping blocks were compared and are character-identical aside from
    indentation.
- savings: ~1 line for the dead re-export, ~4 lines for the helper extraction
  (two 5-line blocks become two 1-line calls plus a 3-line helper).
