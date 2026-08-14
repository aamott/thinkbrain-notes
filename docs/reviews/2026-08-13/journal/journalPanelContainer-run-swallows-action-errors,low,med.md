- name: Container swallows rename/delete errors — user gets no feedback
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/JournalPanelContainer.tsx
- lines: 232-241, 263-264
- description: |
    `run` (line 233) catches every action failure with `console.error` and
    then `.finally(reload)`. The reload is correct (the panel should reflect
    truth), but there is no user-facing signal: no toast, no inline error, no
    status banner. For a rename or delete that fails (e.g. file locked on
    Windows, sync conflict), the user sees the row reappear unchanged and has
    no idea why their action was undone.
    AGENTS.md says "Fail loudly: log errors clearly and return typed results."
    The console log is the loud part for developers; the user-facing part is
    missing.
- verification: |
    `run` is the only path for `onRenameEntry`/`onDeleteEntry`/`onNewEntry`/
    `onToday` (lines 259-264). Its catch block has no UI side effect beyond
    the reload.
- fix: |
    Surface a transient error banner or toast from `run`'s catch (the panel
    already has a "Search is unavailable" banner pattern at line 593 that
    could be generalised), or accept a `onError` prop the host wires to the
    shell's notification surface.
