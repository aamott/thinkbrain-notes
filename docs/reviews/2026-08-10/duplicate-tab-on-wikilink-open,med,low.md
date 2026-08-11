- name: clicking a wiki link may open a duplicate tab instead of focusing an existing one
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/DesktopShell.tsx
- lines: 389-406
- description: |
    `onOpenNote` (lines 400-406) delegates to `openMarkdownDocument`, which
    unconditionally calls `createEditorTab({ rootPath, relativePath })` and
    `dispatchTabs({ type: "open", tab })` (lines 389-395). Whether clicking a
    link to an already-open note focuses that tab or opens a duplicate depends
    entirely on the `desktopTabReducer` `open` case deduplicating by
    `resource.relativePath` — which is not among the files reviewed here.

    If the reducer does *not* deduplicate, every wiki-link click on a note
    that is already open in another tab will spawn a second tab for the same
    file, and the two tabs will race on save. This is a common Obsidian-style
    UX papercut and worth verifying.

    Action: confirm `desktopTabReducer`'s `open` case focuses an existing tab
    with the same `rootPath`/`relativePath` before creating a new one. If it
    does not, add the dedup there (or in `openMarkdownDocument` before
    `createEditorTab`). The same concern applies to the
    `onOpenSearchResult`/`onMarkdownFileSelected`/command-palette paths that
    also call `openMarkdownDocument`.
- verification: |
    `DesktopShell.tsx` lines 389-395 show `openMarkdownDocument` always
    constructing a new tab via `createEditorTab` and dispatching `open`.
    `onOpenNote` (lines 400-406) calls it with no existence check. The
    `desktopTabReducer` implementation was not in the reviewed file set, so
    dedup behavior is unconfirmed.
