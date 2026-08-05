- name: ThemeFile.version is parsed and serialized but never acted on
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/theme.ts
- lines: 38, 191-204, 247-256, 364-371
- description: |
    The `ThemeFile.version` field is:
      - declared in the interface (line 38),
      - validated as a non-negative integer (lines 191-204, `readVersion`),
      - serialized by `serializeThemeFile` (line 368),
      - round-trip tested (theme.test.ts lines 318-320),

    but nothing in the codebase ever *branches* on `version`. There is no
    migration path, no version-gated behavior, no "unsupported version"
    rejection. The field is carried through parse → serialize unchanged.

    For an MVP with a single schema version this is YAGNI — the field adds
    validation surface and a required-field error path (`theme.version.invalid`)
    that rejects otherwise-valid themes over a metadata field no consumer reads.
    A theme author who omits `version` gets a hard error for no functional
    reason.

    Two options:
      1. If versioning is genuinely planned soon, keep the field but default
         it to `0`/`1` when missing (treat absent as "current") instead of
         hard-failing, so the field is optional until a v2 exists.
      2. If no migration is planned, drop the field from the required schema
         and remove `readVersion` + its test block to reduce dead code.

    The plan doc does not mention versioning or migrations in its design
    decisions or acceptance criteria, suggesting option 2 is appropriate for
    now. Either way, the current "required but unused" state is the worst of
    both — it rejects files for a field nothing reads.
- verification: |
    Read `packages/core/src/theme.ts` — `version` is read at line 191 and
    serialized at line 368 but never referenced in any conditional.
    `grep -rn "\.version" apps/desktop/src/settings apps/desktop/src/native`
    shows no consumer of `result.theme.version` in the desktop layer.
    Read `plans/theme-foundation/pending-importable_themes-med-hard.md` —
    no mention of versioning, migration, or schema evolution.
