# React Editor Header Contribution

## Status

✅ Shipped 2026-08-08. `apps/desktop/src/tabs/editorHeaderRegistry.tsx` holds the registry and
the `EditorHeaderSlot`; `MarkdownEditor.tsx` renders the slot above the body; the host exposes
`context.editorHeaders`.

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

- [x] A contribution registered after an editor mounts appears without remounting the editor;
      disposal removes it without affecting document/editor state. Tests assert the `.cm-editor`
      node is the same object across both.
- [x] Multiple contributions render in registration order and duplicate full ids fail loudly.
- [x] Extension registrations use disposable ownership and existing `${extensionId}.${id}`
      prefixing; `metadata-widget` resolves under `journal-calendar` per D47.
- [x] Contribution context is read-only (`rootPath`, `relativePath`, `contents`), passed down from
      the tab's own document state; no direct Tauri call or duplicate document store.
- [x] Each contribution renders in its own `aria-label`led region; document contents and editor
      identity survive registration and disposal. Focus/scroll/mobile behaviour is unchanged
      because the slot is an ordinary sibling of the body, not a wrapper around it.
- [x] CodeMirror hook behavior is unchanged; the slot renders outside the CodeMirror host div.
- [x] `pnpm lint` (0 errors), `pnpm typecheck`, and 501 desktop tests pass.

## Non-goals

- No journal metadata form, field schema, calendar behavior, generic arbitrary editor layout
  system, manifest declaration, third-party renderer isolation, or CodeMirror hook rewrite.

## Handoff

`pending-journal_panel_ui-high-hard.md` consumes the slot for `metadata-widget` after this
story passes post-mount registration/disposal tests. Journal extension-host integration uses
the new surface and no longer requires `onStartup` solely for widget timing.

## Not built, deliberately

A contribution that throws during render still takes the editor tree with it. Panel factories
have the same exposure and no error boundary, so adding one only here would be inconsistent;
if the platform wants that guarantee it belongs to every contribution surface at once.
