- name: click handler does not trim target text, ignores modifier keys, and uses a non-null assertion
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/tabs/livePreview/index.ts
- lines: 90-111
- description: |
    Three minor issues in the click handler:

      1. **Untrimmed target** (line 100): `view.state.doc.sliceString(targetFrom, targetTo)`
         is passed straight to `resolveWikiLinkTarget`. For `[[ My Note ]]`
         (leading/trailing spaces inside the brackets) the target is
         `" My Note "`. Whether resolution succeeds depends entirely on
         `resolveWikiLinkTarget`'s own trimming. The decoration-side handler
         in `links.ts` (line 91) has the same behavior, so styling and click
         resolution are at least consistent — but if the resolver does *not*
         trim, both styling and clicking will treat `[[ My Note ]]` as broken
         even when `My Note.md` exists. Worth either trimming here
         (`targetText.trim()`) or asserting in a test that the resolver trims.

      2. **No modifier-key handling** (lines 72-110): the handler does not
         inspect `event.ctrlKey`/`event.metaKey`/`event.shiftKey`. A user who
         `ctrl`/`cmd`-clicks a link expecting "open in new tab" gets the same
         in-place open as a plain click, and there is no way to request a
         background tab. If/when tab-opening supports a "new tab" mode, the
         handler should forward the modifier state to `onOpenNote` (e.g.
         `onOpenNote(path, { background: event.metaKey || event.ctrlKey })`).

      3. **Non-null assertion** (line 108): `options.onOpenNote!(resolvedPath)`
         is safe only because the enclosing `options.onOpenNote ?` guard at
         line 70 ensures the handler is built only when the callback exists.
         A local `const onOpenNote = options.onOpenNote;` after the guard
         would let the call site be non-null without `!` and survive a future
         refactor that moves the guard.

- verification: |
    `livePreview/index.ts` line 100 calls `sliceString` with no `.trim()`;
    line 105 passes the result to `resolveWikiLinkTarget`; line 108 uses `!`.
    No reference to `ctrlKey`/`metaKey`/`shiftKey` in the file.
    `links.ts` line 91 likewise slices without trimming.
