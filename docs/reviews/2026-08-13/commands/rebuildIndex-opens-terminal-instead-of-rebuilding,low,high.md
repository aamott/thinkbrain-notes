- name: rebuildIndex command opens terminal panel instead of rebuilding the search index
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/DesktopShell.tsx
- lines: 718
- description: |
    The "Rebuild workspace index" command (`commandRegistry.ts` id `"rebuild-index"`,
    line 172) calls `rebuildIndex()` from the `DesktopCommandContext`. The shell
    wires that effect to `updateBottomPanel("terminal")`:

    ```ts
    rebuildIndex: () => updateBottomPanel("terminal"),
    ```

    This opens the bottom terminal panel — it does not rebuild any index. The
    actual rebuild path is `useSearchIndexStore.getState().indexWorkspace(rootPath, files)`
    (used elsewhere in the same file at lines 409, 535, 562) and
    `useWikiLinkIndexStore.getState().indexWorkspace(rootPath, files)` (lines 410,
    536, 563). The command is marked `availability: "available"` and has
    keywords `["search", "index", "refresh"]`, so users will run it expecting a
    reindex and instead get a terminal panel opened.
- verification: |
    `grep -r "rebuildIndex" apps/desktop/src` shows the command context field
    (commandRegistry.ts:40,176), the test stub (commandRegistry.test.ts:21), and
    the shell wiring (DesktopShell.tsx:718). The shell wiring calls
    `updateBottomPanel("terminal")` while the real reindex API is
    `useSearchIndexStore.getState().indexWorkspace` (searchIndexStore.ts:93) and
    `useWikiLinkIndexStore.getState().indexWorkspace` (wikiLinkIndexStore.ts:132),
    both already called from `handleWorkspaceOpened` and workspace-change effects
    in the same file.
