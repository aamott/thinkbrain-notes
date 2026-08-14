- name: JournalTrouble switch is a parallel-conditional mapping
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/journalChrome.tsx
- lines: 67-99
- description: |
    `JournalTrouble` is a 3-arm `switch` over `status: JournalTroubleCode`
    where each arm returns an `EmptyState` with a hardcoded title and action
    list. The structure is a classic input→output lookup table dressed as a
    switch: the only variability is the title string and which callbacks
    (`onRetry`/`onChooseFolder`/`onOpenSettings`) are wired into the actions.
    Collapsing it into a `Record<JournalTroubleCode, { title; actions }>`
    (built once, parameterised by the three callbacks) is shorter AND makes
    the "three failure modes, each with its copy" relationship read at a
    glance — which is the stated goal of the file's own header comment
    ("two switch statements drift").
- verification: |
    Read of lines 67-99: each case is `return <EmptyState title=... actions=.../>`
    with no other logic. The three `JournalTroubleCode` values are exhaustive
    (the type is `"no-workspace" | "invalid-root" | "unreadable"`).
- fix: |
    Build a lookup table inside the component:
      `const COPY: Record<JournalTroubleCode, { title: string; actions: ...[] }> = { ... }`
    keyed on `status`, mapping to the title and the action list (with the
    callback refs). Then `return <EmptyState {...COPY[status]} />`.
    ~8 lines saved and the copy lives in one literal.
