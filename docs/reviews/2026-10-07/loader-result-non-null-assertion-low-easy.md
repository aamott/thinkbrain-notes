# Loader result types force non-null assertions on callers

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/packages/core/src/extensions/loader.ts`
- **Lines:** 21-30

## Description

`EntryPathResult` and `ExtensionModuleResult` model "value or diagnostic" as two
independent nullable fields:

```ts
{ path: string | null; diagnostic: ManifestDiagnostic | null }
```

The invariant "`path` is null iff `diagnostic` is non-null" is only implied, not typed,
so consumers must use non-null assertions: `localDirectoryLoader.ts:128` does
`entry.diagnostic!` and :154 does `validated.diagnostic!`. If the invariant ever broke,
the `!` would hide it instead of surfacing it.

## Recommendation

Model the results as discriminated unions, e.g.

```ts
type EntryPathResult =
  | { readonly path: string; readonly diagnostic: null }
  | { readonly path: null; readonly diagnostic: ManifestDiagnostic };
```

Then `if (!entry.path)` narrows and `entry.diagnostic` is readable without `!`. This is a
public type-shape change — the two consumer lines in
`apps/desktop/src/extensions/localDirectoryLoader.ts` need adjusting together, which is
why it is a finding rather than an inline fix.

## Verification

Read loader.ts:21-30 and the `rejectPath` helper (:42-45) which always pairs null-path
with a diagnostic. Read localDirectoryLoader.ts:127-128 and :150-154 — both consume the
invariant via `!`.
