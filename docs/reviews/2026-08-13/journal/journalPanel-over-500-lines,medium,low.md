- name: JournalPanel exceeds 500-line preferred limit
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/JournalPanel.tsx
- lines: 1-661
- description: |
    At 661 lines this is well over the "< 500 preferred" guidance and the
    largest file in the journal area. Two extractions are independently
    coherent:
      1. The `Row` component (lines 104-216) plus `rowName` (lines 95-102) —
         a self-contained presentational unit with its own prop interface,
         already used only inside this file but with no dependency on the
         panel's hooks/state.
      2. The `body()` state switch (lines 493-589) — the seven-state render
         dispatch, which delegates to `JournalTrouble`/`EmptyState`/the list
         and only needs `view`, the list ref, and the row callbacks.
    The virtualisation bookkeeping (offsets, drawn window, measurement
    effects, roving focus) is the genuine core of the panel and would stay.
- verification: |
    `wc -l` is 661. `Row` has its own typed props block (lines 115-127) and no
    closure over panel state — it receives everything via props, so it is
    trivially extractable. `body()` is a pure function of `view` + props.
- fix: |
    Move `Row` + `rowName` to `JournalRow.tsx`. Optionally move the `body`
    switch to a `JournalPanelBody` component that takes the view and the
    row/list callbacks. Both bring the main file under 500.
