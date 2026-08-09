- name: MetadataWidgetContainer healed-values and unconfigured-values can shadow each other on key collision
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/MetadataWidgetContainer.tsx
- lines: 56-101
- description: |
    `MetadataWidgetContainer` builds the `values` map in two passes:

    1. `healed(metadata, definitions)` (lines 56-72): for each configured
       `definition`, if `metadata.invalid[definition.id]` has a select value
       via `fieldChoices`, it writes `values[definition.id] = ...`.
    2. The unconfigured loop (lines 95-101): for each `unconfigured` field
       inferred from `metadata.unconfigured`, it writes
       `values[field.id] = raw`.

    A key can appear in both `metadata.invalid` and `metadata.unconfigured`
    only when a configured field's value is invalid AND the same key is also
    unconfigured — which cannot happen for one key (a key is either configured
    or not). However, `healed` writes into `values` for configured definitions,
    and the unconfigured loop writes into the same `values` object for
    unconfigured keys. The real shadowing risk is subtler: `healed` spreads
    `metadata.values` first (`{ ...metadata.values }`), then overwrites with
    healed invalid values. If a key is both in `metadata.values` (valid) and
    `metadata.invalid` (which `readJournalMetadata` never does — a key goes to
    exactly one bucket), there is no conflict. So the buckets themselves are
    disjoint by construction in `readJournalMetadata` (`frontmatter.ts` lines
    238-266: each key hits exactly one of `values`/`invalid`/`unconfigured`).

    The actual issue is narrower but real: `inferField` (lines 42-46) infers a
    `multi-select` with `options: []` for any array value. When that inferred
    field is promoted via `onDefineField` (`journal.tsx` lines 119-126), it is
    serialized as `{ id, label: key, type: "multi-select", options: [] }` and
    written to settings. `parseFieldDefinitions` → `validateFieldDefinition`
    accepts an empty `options` array (`isStringArray([])` is `true`,
    `frontmatter.ts` line 130), so the field is saved. But
    `JournalFieldDefinitionsControl` has a `choiceless` guard (line 163-164)
    that blocks saving a select with no options *from the form* — yet the
    promotion path bypasses the form entirely. The result is a configured
    `multi-select` field with zero options that the user cannot fill in from
    Settings without editing it, and whose existing notes show the value as a
    dashed "extra" pill (`MetadataField.tsx` lines 65-106 via `fieldChoices`).
    The promotion should either infer `text` for arrays too (consistent with
    the "conservative inference" docstring on `inferField`), or the promotion
    handler should refuse/flag empty-options selects.
- verification: |
    Read `MetadataWidgetContainer.tsx` lines 42-46 (`inferField` returns
    `multi-select` with `options: []` for arrays) and lines 91-101
    (unconfigured values written into `values`). Read `journal.tsx` lines
    119-126 (`onDefineField` serializes the inferred field directly to
    settings). Read `frontmatter.ts` lines 129-131 (`isStringArray([])` is
    `true`) and lines 166-169 (empty options accepted for select types). Read
    `JournalFieldDefinitionsControl.tsx` lines 163-164 (`choiceless` guard
    only in the form, not the promotion path). Read `MetadataField.tsx` lines
    65-106 (dashed extra pills for values not in options).
