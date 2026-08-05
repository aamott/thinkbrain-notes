- name: `isRecord` and `getErrorMessage` helpers are duplicated verbatim across dynamic.ts and settings.ts
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/settings/dynamic.ts
- lines: 250-257 (also settings.ts:390-395)
- description: |
    `dynamic.ts:250-252` defines `isRecord` and `dynamic.ts:255-257` defines
    `getErrorMessage`. Both are byte-for-byte identical to the same helpers in
    `settings.ts:390-395`:
      isRecord:        `Boolean(value) && typeof value === "object" && !Array.isArray(value)`
      getErrorMessage: `error instanceof Error ? error.message : String(error)`
    Two copies of the same platform-agnostic utility in the same package drift
    risk and violate the maintainability rule in global_rules.md
    ("Maintainability is king").

    Fix: extract both into a small shared helper (e.g.
    `packages/core/src/settings/internal.ts` or reuse an existing core util)
    and import from both modules. Keep them platform-agnostic (no Node
    built-ins) per packages/core/AGENTS.md.
- verification: |
    Read dynamic.ts (lines 250-257) and settings.ts (lines 390-395);
    confirmed identical implementations.
