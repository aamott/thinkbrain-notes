- name: JournalFieldDefinitionsControl exceeds 500-line file-size guideline
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/JournalFieldDefinitionsControl.tsx
- lines: 1-540
- description: |
    The file is 540 lines, exceeding the project's "< 500 lines preferred"
    convention (AGENTS.md). It contains three distinct surfaces: the field-list
    view (rows with move/edit/remove), the add/edit card (label/key/type/options
    form), and the JSON escape-hatch textarea. Each has its own state
    (`draft`, `choice`, `removing`, `json`, `jsonDraft`, `jsonError`) and its
    own render branch. The `card` function alone (lines 196-349) is ~150 lines
    of JSX. Splitting the card into a `FieldDraftCard` component and the JSON
    hatch into a `FieldDefinitionsJsonEditor` component would bring each file
    under 500 lines, make the three modes independently testable, and reduce
    the number of `useState` hooks competing in one component body.
- verification: |
    Read the full file (540 lines). Confirmed three render branches
    (list at 412-528, card at 196-349, JSON at 372-408) and six `useState`
    hooks (lines 139-146). AGENTS.md states "Small, focused files (< 500 lines
    preferred)".
