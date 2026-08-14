- name: restoreTab uses unsafe type cast on persisted tab kind
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/DesktopShell.tsx
- lines: 1105
- description: `restoreTab` casts `persisted.kind` (a string from deserialized local state) to `Exclude<import("@thinkbrain/core").TabKind, "editor">` without runtime validation:

  ```ts
  return createStaticTab(persisted.kind as Exclude<import("@thinkbrain/core").TabKind, "editor">, persisted.title);
  ```

  If the persisted state is corrupted or was written by a newer version with an unknown tab kind, this cast silently produces a tab with an invalid `kind`. `createStaticTab` creates `{ id: kind, title, kind }` without validation, and `TabContent` would render an `Unavailable` placeholder (since `desktopTabRegistry.get(tab.kind)` returns undefined for unknown kinds). The app wouldn't crash, but a stale or corrupted persisted state would silently produce a broken tab.

  Fix: validate `persisted.kind` against the known static tab kinds before casting, or use a runtime guard. If the kind is unrecognized, return `null` (skip restoration) the same way editor tabs with missing paths are skipped.

- verification: Read `restoreTab` (lines 1098-1106) and `createStaticTab` in `tabModel.ts` (line 57-59). Confirmed the cast has no runtime guard. The editor branch (line 1099-1103) validates `rootPath` and `relativePath`, but the static branch does not validate `kind`.
