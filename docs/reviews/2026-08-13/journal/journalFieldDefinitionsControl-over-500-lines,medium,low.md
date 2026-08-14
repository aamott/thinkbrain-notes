- name: JournalFieldDefinitionsControl exceeds 500-line preferred limit
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/JournalFieldDefinitionsControl.tsx
- lines: 1-530
- description: |
    At 530 lines this is over the AGENTS.md "< 500 preferred" guidance (and
    still under the 800 hard cap). The file holds three distinct surfaces that
    are independently coherent:
      1. The add/edit "card" (lines 185-338) — the form for one field draft.
      2. The JSON escape hatch (lines 361-397) — the textarea fallback.
      3. The list + reorder/remove confirm (lines 399-517) — the saved fields.
    Each is only reachable from the main component's render switch, but each
    is self-contained state-wise (the card owns `draft`/`choice`, the JSON
    hatch owns `jsonDraft`/`jsonError`, the list owns `removing`). Splitting
    the card and the JSON hatch into their own components would bring the
    main file under 500 and make each piece testable in isolation.
- verification: |
    `wc -l` of the file is 530. The three blocks are visually delimited by
    `// ---- the add / edit card` / `// ---- the JSON escape hatch` /
    `// ---- the list` comment headers, confirming they are separable.
- fix: |
    Extract `FieldDraftCard` (the card function, lines 185-338) and
    `FieldDefinitionsJson` (lines 361-397) into sibling modules. The main
    component keeps the list and the draft/JSON toggle state.
