- name: wiki-link navigation is mouse-only — no keyboard follow and no hover/focus affordance
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/tabs/livePreview/index.ts
- lines: 65-113
- description: |
    The only input path that opens a note is the `click` `domEventHandlers`
    entry. There is no keybinding (e.g. `Mod-Enter` / `Enter` while the cursor
    is inside a `WikiLink`) that follows the link under the caret, so keyboard
    and screen-reader users cannot navigate. The `cm-link-resolved` element is
    a `<span>` produced by a Mark decoration, not a focusable `<a>`, so it is
    not in the tab order and has no role/aria-label.

    `theme.ts` compounds this: `.cm-link-resolved` (lines 104-107) sets
    `cursor: pointer` and color but defines no `:hover` or `:focus-visible`
    style, so even mouse users get no visual feedback that the span is
    interactive. `.cm-link-broken` (lines 108-112) correctly sets
    `cursor: default`.

    Suggested fix:
      - Add a `keymap` extension (returned from `livePreview()` alongside the
        plugin) that, on `Mod-Enter` (and optionally plain `Enter` when the
        selection is collapsed inside a `WikiLink`), resolves the target under
        the caret the same way the click handler does and calls `onOpenNote`.
      - Add `:hover`/`:focus-visible` rules for `.cm-link-resolved` in
        `theme.ts` (e.g. `textDecorationThickness: 2px` or a lighter primary
        tint) so the affordance is visible.
      - Consider a `role="link"` + `tabindex` via a widget for resolved links
        if full a11y is required, though that conflicts with live-preview's
        mark-based concealing and is a larger change.
- verification: |
    `livePreview/index.ts` returns `[plugin, clickHandler, livePreviewTheme]`
    (line 115) — no `keymap.of(...)` is included. `grep` for `keymap` in this
    file returns nothing. `theme.ts` `.cm-link-resolved` rule (lines 104-107)
    has no `:hover`/`:focus` selectors. `wikiLink.test.ts` has no keyboard
    interaction test.
