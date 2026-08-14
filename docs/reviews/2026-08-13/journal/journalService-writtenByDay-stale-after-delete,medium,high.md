- name: writtenByDay/writtenPaths go stale after delete or rename
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/journalService.ts
- lines: 152-153, 197-198, 213, 225-231
- description: |
    `createEntry` records the new path in two in-memory caches:
      `writtenPaths` (used to avoid same-minute collisions on a lagging dir scan)
      and `writtenByDay` (used by `openToday` to find today's entry when the
      listing hasn't caught up).
    Neither `deleteEntry` (line 229) nor `renameEntry` (line 225) evicts the
    path from either set. After a user deletes the only entry written today and
    clicks "Today", `openToday` (line 213) computes:
      `const existing = todays.at(-1)?.relativePath ?? writtenByDay.get(today);`
    A fresh `listEntries` returns no entries for today, so it falls back to
    `writtenByDay.get(today)`, which still holds the *deleted* path. The
    subsequent `workspace.openNote(existing)` then fails (the file is gone),
    and the error only surfaces via the container's `run` catch → `console.error`.
    The user clicks Today and nothing visible happens.
    A rename has the same shape: `writtenByDay` keeps the old path, and a
    following "Today" tries to open a path that no longer exists under that name.
- verification: |
    grep of journalService.ts confirms `writtenByDay.delete` and
    `writtenPaths.delete` never appear; only `.add` and `.set` and `.get` are
    used. `deleteEntry`/`renameEntry` bodies are bare pass-throughs to
    `workspace.deleteNote`/`workspace.renameNote` with no cache cleanup.
- fix: |
    In `deleteEntry`, remove `relativePath` from `writtenPaths` and remove any
    `writtenByDay` entry whose value equals `relativePath`.
    In `renameEntry`, remove the old path and add the new one to both sets
    (a rename preserves "written this session" semantics).
