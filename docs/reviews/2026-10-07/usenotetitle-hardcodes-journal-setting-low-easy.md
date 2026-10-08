# `useNoteTitle` reaches into the journal extension's settings key and re-declares its default

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/useNoteTitle.ts`
- **Lines:** 7–13

## Description

The shell's markdown tab title decides whether a note lives "in the
journal" by reading the *journal extension's* settings key as a hardcoded
literal:

```ts
const JOURNAL_ROOT_KEY = "extension-journal-calendar.root";
...
const journalRoot = (getEffectiveValue(JOURNAL_ROOT_KEY) ?? "journal") as string;
```

Three boundaries are crossed in one expression:

1. The `extension-` module prefix and the `.root` setting key — the
   extension's own settings namespace — are reconstructed by hand rather
   than through `settingsModuleId` or a shared helper (see the companion
   finding on scattered id construction).
2. The default `"journal"` is hardcoded here a third time — the schema
   declares `"root"`'s default in `journal.tsx:64` and
   `journal.tsx:201–205` resolves `?? DEFAULT_ROOT`. If the extension ever
   renames the key or changes the default, the tab title silently stops
   matching the folder journal actually writes to — no type error, no
   registration failure.
3. This read also inherits the dropped-persisted-value gap: before journal
   activates, `getEffectiveValue` has no registered schema for the key, so
   the tab title and the journal's real root can disagree for the same
   session.

A core shell hook should not know the name of a specific extension's
setting.

## Recommendation

Move the knowledge to the extension side. Options: export a
`JOURNAL_ROOT_SETTING_KEY` (and `DEFAULT_ROOT`, already exported) from the
journal module and import it here — the file already imports
`getJournalRoot`; or better, have journal own the title logic entirely via
`useDocumentTitle`, which it already calls itself — the shell hook is
duplicating that hook's `isJournalNote` derivation for the `shortName`
fallback. At minimum, derive the key via a shared
`extension-${id}.${key}` helper and fall back through
`extensionDefaultValue` (which `journal.tsx` itself uses at line 182).

## Verification

`grep -rn "extension-journal-calendar" apps/desktop/src` — the only
references are `useNoteTitle.ts` and the journal extension itself.
`journal.tsx:64` declares the same default `"journal"`; renaming the key or
default in the schema changes journal's writes but not this shell check.
