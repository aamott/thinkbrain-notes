- name: journal registerJournalControls bypasses the extension's disposable ownership
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/builtins/journal.tsx
- lines: 115
- description: |
    `activateJournal` registers its settings schema, panel, editor header, tabs,
    and commands through `context.*` surfaces, all of which are owned by
    `context.subscriptions` and cleaned up on deactivation. However
    `registerJournalControls()` (line 115) calls the global
    `registerControl(FIELD_DEFINITIONS_CONTROL, JournalFieldDefinitionsControl)`
    in `settings/controlRegistry.ts`, which has **no dispose/remove mechanism**
    — it permanently mutates a module-level `Map`. If the journal extension ever
    deactivates, the custom settings control stays registered.

    In practice the journal is a built-in that never deactivates, so this is an
    architectural inconsistency rather than a live leak. But it breaks the
    "everything an extension registers is disposable" contract that the rest of
    the activation honours, and it would become a real leak if the journal ever
    became a loadable extension or if a test activates/deactivates it
    repeatedly (the control registry uses last-wins `set`, so re-activation is
    safe, but the entry is never reclaimed).

    Options: give `controlRegistry.registerControl` a disposable return, or
    route the control registration through a new `context.settings.registerControl`
    surface that ties the registration to the activation scope.
- verification: |
    Read journal.tsx line 115 (`registerJournalControls()`) and
    `JournalFieldDefinitionsControl.tsx` lines 527-530 (the shim calls
    `registerControl`). Read `controlRegistry.ts` lines 61-66:
    `registerControl` does `controlRegistry.set(key, component)` and returns
    `void` — no disposable. Compared with every other registration in
    `activateJournal` (lines 114, 251, 268, 349, 357, 368, 379), which all go
    through `context.*.register` returning a `Disposable`.
