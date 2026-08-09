- name: openToday and createEntry race — listEntries may not see a just-created note
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/journal/journalService.ts
- lines: 143-182
- description: |
    `createEntry` calls `workspace.listNotes(folder)` to compute a collision-free
    path, then `workspace.createNote(...)` and `workspace.openNote(...)`.
    `openToday` calls `listEntries()` (which calls `listNotes`), filters for
    today, and if none exists calls `createEntry()`. Both `listNotes` and
    `createNote` go through the native bridge (`extensionWorkspace.ts` lines
    118-128, 108-111). `listNotes` reads `entries.listWorkspaceEntries(root,
    false)` — a directory scan — while `createNote` writes via
    `documents.createMarkdownDocument`. There is no guarantee that a note
    created in one native call is visible to a subsequent `listWorkspaceEntries`
    in a separate native call on all platforms (FS cache coherency, especially
    on networked/synced folders like OneDrive/SyncThing which the project
    explicitly supports). If a user rapid-fires "Today" twice, or if
    `openToday`'s `listEntries()` runs before a just-completed `createEntry`'s
    write has flushed to the directory listing, `openToday` can create a
    duplicate entry for today.

    The collision logic in `resolveNewEntryPath` (`paths.ts` lines 60-71) does
    protect against same-minute duplicates by checking `taken` — but only if
    `listNotes` actually returns the just-created file. If the directory listing
    is stale, `taken` won't include the new path and a same-minute second
    `createEntry` will produce a non-counter-suffixed duplicate (same stem,
    same `HHmm`), which the OS will either reject or overwrite depending on the
    `createMarkdownDocument` implementation.

    This is not a definite bug on local FS (where writes are synchronously
    visible), but on the synced folders the project targets it is a real race.
    At minimum, `openToday` should use the path returned by `createEntry`
    rather than re-listing, and the service should document that `listNotes`
    may lag `createNote` on synced storage.
- verification: |
    Read `journalService.ts` lines 143-167 (`createEntry`: list → resolve →
    create → open) and lines 169-182 (`openToday`: list → filter →
    create-or-open). Both call `listFolder`/`listEntries` which call
    `workspace.listNotes` → `entries.listWorkspaceEntries`. `createNote` calls
    `documents.createMarkdownDocument` — a separate native command. No
    synchronization primitive ensures the listing reflects the write. The
    project explicitly supports OneDrive/SyncThing (AGENTS.md line 3), where
    listing lag is known.
