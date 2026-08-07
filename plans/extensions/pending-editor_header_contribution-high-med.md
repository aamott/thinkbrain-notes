# React Editor Header Contribution

## Status

⬜ Platform prerequisite approved by D44; not implemented.

## Goal

Add a first-class React contribution slot above the Markdown editor body with an observable,
disposable registry. Built-ins can add or remove interactive editor-header surfaces in
already-open editors without portaling into CodeMirror DOM or depending on startup order.

## Decision constraints

- D44 owns the mounting route: React editor header, not a CodeMirror panel/block widget.
- The registry must support subscribe/dispose so mounted editors react to registration changes.
- CodeMirror `editorHooks` remain limited to CodeMirror extensions and keybindings.
- Relative ids use existing kebab-case validation and host prefixing; D47 assigns the journal
  contribution local id `metadata-widget`.

## Scope

- Define a typed editor-header contribution and read-only editor context sufficient for a
  contribution to evaluate the active document through existing editor/workspace boundaries.
- Add an app-wide registry with ordered registration, lookup, subscription, collision checks,
  and disposable removal.
- Expose registration through a distinct extension-context surface such as `editorHeaders`;
  do not overload `editorHooks`.
- Render the slot in `MarkdownEditor.tsx` above the editor body and subscribe mounted editors
  to registry changes.
- Preserve focus, accessible naming, editor scroll behavior, dirty state, and mobile layout.

## Likely files

- `apps/desktop/src/tabs/editorHeaderRegistry.tsx` and tests.
- `apps/desktop/src/tabs/MarkdownEditor.tsx` and focused component tests.
- `apps/desktop/src/extensions/desktopExtensionHost.ts` and tests for scoped registration,
  prefixing, collisions, failed activation, and disposal.

## Acceptance criteria

- [ ] A contribution registered after an editor mounts appears without remounting the editor;
      disposal removes it without affecting document/editor state.
- [ ] Multiple contributions render in deterministic order and duplicate full ids fail loudly.
- [ ] Extension registrations use disposable ownership and existing `${extensionId}.${id}`
      prefixing; `metadata-widget` resolves under `journal-calendar` per D47.
- [ ] Contribution context is read-only and uses existing typed document/workspace boundaries;
      no direct Tauri call or duplicate document store.
- [ ] Keyboard focus, screen-reader labels, editor scrolling, dirty state, and mobile widths are
      covered by focused tests.
- [ ] CodeMirror hook behavior is unchanged; no React portal into CodeMirror-owned DOM.
- [ ] `pnpm lint`, `pnpm typecheck`, and focused desktop tests pass.

## Non-goals

- No journal metadata form, field schema, calendar behavior, generic arbitrary editor layout
  system, manifest declaration, third-party renderer isolation, or CodeMirror hook rewrite.

## Handoff

`pending-journal_panel_ui-high-hard.md` consumes the slot for `metadata-widget` after this
story passes post-mount registration/disposal tests. Journal extension-host integration uses
the new surface and no longer requires `onStartup` solely for widget timing.
