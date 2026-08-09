- name: belongsHere does not normalize the journal root, so a trailing slash or whitespace hides the metadata widget
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/builtins/journal.tsx
- lines: 72-80
- description: |
    `belongsHere` decides whether the metadata widget renders on a note:
    ```ts
    const belongsHere = (relativePath: string | null, contents: string): boolean => {
      if (relativePath === null) return false;
      const root = context.settings.get<string>("root") ?? DEFAULT_ROOT;
      if (relativePath.startsWith(`${root}/`)) return true;
      ...
    };
    ```
    The raw setting is used directly in a `startsWith` check. The core
    path module (`packages/core/src/journal/paths.ts` lines 16-25) provides
    `normalizeRoot`, which trims, strips leading/trailing slashes, rejects `..`,
    and normalizes backslashes — but `belongsHere` does not call it. If the user
    configures `root` as `"journal/"` (trailing slash), `" journal "` (spaces),
    or `"journal\\"` (backslash), the check becomes
    `startsWith("journal//")`, `startsWith(" journal /")`, or
    `startsWith("journal\\/")` respectively, none of which match a real entry
    path like `"journal/2026/08/2026-08-08-0930.md"`. The widget then fails to
    appear on journal entries even though the service (which does normalize via
    `journalEntryFolder` → `normalizeRoot`) would file and list them correctly.
    This is a contract mismatch between the extension layer (raw setting) and
    the core/service layer (normalized root).

    The same raw `root` is also read in `activateJournal` line 60 for the
    service's `root: () => ...` accessor, but the service's own `requireRoot`
    (`journalService.ts` lines 102-113) only checks for `..` and empty — it does
    not trim or strip slashes before passing to `workspace.listNotes`, which
    appends a `/` itself (`extensionWorkspace.ts` line 127). So a trailing slash
    in the setting produces `journal//` as the list prefix, which would also
    fail to match entries. Both the widget gate and the listing path need the
    same normalization `normalizeRoot` provides.
- verification: |
    Read `journal.tsx` lines 72-80 (raw `root` in `startsWith`). Read
    `paths.ts` lines 16-25 (`normalizeRoot` trims and strips slashes). Read
    `journalService.ts` lines 102-113 (`requireRoot` does not call
    `normalizeRoot`; only checks `..` and empty). Read
    `extensionWorkspace.ts` lines 118-128 (`listNotes` appends `/` to the
    prefix, so `journal/` becomes `journal//`). Confirmed the core normalizer
    is not used at either the extension gate or the service validation path.
