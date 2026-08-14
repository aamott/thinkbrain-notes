- name: uniqueStrings lives in settings/internal but is imported by non-settings core modules — layering violation
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings/internal.ts
- lines: 31-34
- description: |
    `uniqueStrings` is defined in `packages/core/src/settings/internal.ts` (a
    leaf module dedicated to the modular settings system, per its header
    comment lines 1-9). However, the only callers are non-settings core
    modules:
      - `packages/core/src/markdown.ts` line 2: `import { uniqueStrings } from "./settings/internal"`
      - `packages/core/src/frontmatter.ts` line 3: `import { isRecord, uniqueStrings } from "./settings/internal"`

    This creates a dependency from `markdown.ts` and `frontmatter.ts` (general
    core utilities) into the settings subsystem's internal leaf module. The
    `settings/internal.ts` header explicitly says it exists to "break import
    cycles and eliminate duplication of small utility functions that were
    previously copy-pasted across `settings.ts`, `settings/dynamic.ts`, and the
    desktop settings modules" — i.e. it is settings-scoped. Non-settings
    modules reaching into it widens the module's audience and creates an
    implicit coupling between unrelated subsystems.

    `isRecord` and `getErrorMessage` are also generic helpers in
    `settings/internal.ts`, but they are at least re-exported through
    `settings/index.ts` for settings consumers. `uniqueStrings` is not
    re-exported from the settings barrel at all — it is only used by
    non-settings modules, confirming it does not belong here.

    Fix: move `uniqueStrings` (and consider `isRecord`/`getErrorMessage`) to a
    shared core utility module (e.g. `packages/core/src/utils.ts` or similar),
    then update `settings/internal.ts` to re-export from there if the settings
    layer still needs it. This keeps `settings/internal.ts` true to its
    stated scope.
- verification: |
    `grep -r "uniqueStrings"` matches 3 files: `settings/internal.ts`
    (definition), `markdown.ts` (import), `frontmatter.ts` (import). Neither
    `markdown.ts` nor `frontmatter.ts` is a settings module. The
    `settings/index.ts` barrel (line 24) re-exports only `isRecord` and
    `getErrorMessage` from `./internal`, not `uniqueStrings`.
