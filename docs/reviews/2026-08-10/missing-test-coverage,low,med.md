- name: no tests cover noteIndex updates after mount, keyboard nav, whitespace targets, or modifier-click
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/tabs/livePreview/wikiLink.test.ts
- lines: 1-145
- description: |
    The new tests cover static mount-time behavior and a single left-click, but
    leave several regressions unguarded:

      1. **noteIndex update after mount** — every test calls `mountPreview`
         once with a fixed `noteIndex`. None reconfigures the extension after
         mount to simulate a note being created/renamed. This is exactly the
         scenario that exposes the stale-noteIndex bug (see
         `stale-noteindex-reconfigure,med,high.md`): a link that was
         `cm-link-broken` should become `cm-link-resolved` after the index
         updates, and a click on it should then open the note. A test that
         mounts with an empty index, asserts `cm-link-broken`, reconfigures
         with `NOTE_INDEX`, and asserts `cm-link-resolved` + click navigation
         would catch it. (The harness may need a helper to reconfigure the
         livePreview compartment.)
      2. **Keyboard navigation** — no test asserts that any key follows a
         link, because no keybinding exists (see
         `keyboard-and-hover-a11y,med,med.md`). Once a keybinding is added, a
         test should mount with the caret inside a `WikiLink`, dispatch the
         key, and assert `onOpenNote` was called.
      3. **Whitespace in target** — `[[ My Note ]]` is a common authoring
         slip. The click handler slices the raw target text
         (`livePreview/index.ts` line 100) and passes it to
         `resolveWikiLinkTarget` untrimmed; whether resolution succeeds
         depends on the resolver's trimming behavior, which is untested here.
      4. **Modifier-click / multiple buttons** — no test for `ctrl`/`cmd`
         click (open-in-new-tab intent) or for the handler ignoring
         non-primary buttons. Currently the handler does not inspect
         `event.ctrlKey`/`event.metaKey` at all.

    `markdownEditorHooks.test.ts` (lines 1-60) was extended only by the
    `wikiLinkAutocompleteCompartment` field in the fixture; it still does not
    assert that `payload.noteIndex` actually reaches the autocomplete or
    livePreview extensions (e.g. by spying on the extension builders).
- verification: |
    Read `wikiLink.test.ts` in full: the three `describe` blocks cover
    concealment, mount-time resolution styling, and a single left-click.
    `grep` for `reconfigure`, `keymap`, `KeyboardEvent`, `ctrlKey`, `trim`, and
    `" [[ "` in the file returns no matches. `markdownEditorHooks.test.ts`
    asserts only hook ids and non-empty extension/keybinding counts.
