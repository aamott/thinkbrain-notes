- name: Editor hook assembly has no direct test for `getExtensions` or for the migrated Markdown hook set
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/tabs/editorHookRegistry.test.ts
- lines: 1-72
- description: |
    `editorHookRegistry.test.ts` exercises `getKeybindings` (line 53) but never calls
    `getExtensions`. `getExtensions` (editorHookRegistry.ts:63-71) has its own loop
    that filters contributions without an `extensions` factory and concatenates
    results in `orderedEntries` order — logic distinct enough from `getKeybindings`
    to warrant its own assertion (e.g., that a contribution with only `keybindings`
    contributes no extensions, and that extension order follows `order` then
    registration order).

    Separately, `markdownEditorHooks.ts` defines the migrated built-in hook set
    (`history`, `markdown-language`, `line-wrapping`, `cursor-theme`,
    `aria-content-attributes`, `default-keybindings`, `history-keybindings`,
    `tab-keybinding`, `save-keybinding`, `update-listener`) but has no dedicated
    test file. `MarkdownEditor.test.tsx` only verifies that the editor mounts,
    renders `# Initial` / `# Updated`, exposes `aria-label="Markdown editor"`, and
    that the Save button calls `onSave`. It does NOT verify:
    - that typing dispatches `onChange` (the `update-listener` hook),
    - that `Mod-s` triggers `onSave` through the registry-assembled keymap (the
      `save-keybinding` hook),
    - that the full set of hooks is registered (regression guard against accidental
      deletion of e.g. `history` or `markdown-language`).

    The acceptance criterion "Existing built-in features are migrated to use the
    formalized points" is only credible if a test locks in the migrated behavior.
    Add a `markdownEditorHooks.test.ts` asserting the registered ids and that
    `getExtensions`/`getKeybindings` return non-empty arrays, and extend
    `MarkdownEditor.test.tsx` to simulate a `Mod-s` keydown and a document change.
- verification: |
    Read editorHookRegistry.test.ts (no `getExtensions` call), MarkdownEditor.test.tsx
    (no keydown / onChange assertion), markdownEditorHooks.ts (no co-located test
    file). `find_file_by_name` for `markdownEditorHooks.test.*` returns nothing.
