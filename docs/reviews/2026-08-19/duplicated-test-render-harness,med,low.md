- name: Render/container/root test harness duplicated across sync test files
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/sync/ConflictsPanel.test.tsx
- lines: 31-44, 64-70, 72-78
- description: |
    ConflictsPanel.test.tsx (lines 31-44, 64-70, 72-78) and copy.test.tsx (lines 71-79, 95-106) each
    declare their own `root`/`container` module-level state, their own `afterEach` cleanup, and their
    own `render` helper that does `createRoot` + `act` + `append`. The two `render` helpers differ
    only in whether they return the container or the rendered text and whether they unmount
    immediately.

    This is boilerplate that could collapse into a small shared `syncTestHarness.ts` (or reuse an
    existing one if present) exposing `render(element) -> { host, unmount }` and a cleanup hook.
    That would remove ~30 lines per file and keep the cleanup contract identical. The
    `button(host, text)` finder in ConflictsPanel.test.tsx (lines 72-78) is another candidate for
    sharing — copy.test.tsx does not need it but other sync panel tests likely will.
- verification: Read both test files in full; compared the harness blocks line-by-line.
