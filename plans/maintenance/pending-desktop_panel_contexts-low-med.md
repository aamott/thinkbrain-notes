# Desktop Panel Context Separation

## Goal

Stop passing a left-and-right “god object” context to every desktop panel factory.
Give left and right contributions only the state they can use, so a future panel cannot
silently call a fabricated no-op explorer/search callback.

## Files

- `apps/desktop/src/panels/panelRegistry.tsx` — define `LeftPanelContext` and
  `RightPanelContext`; specialize `LeftPanelContribution` and `RightPanelContribution`
  with the matching core `PanelContribution` context. Keep shared `rootPath` in both
  contexts and keep `documentContents` right-only, `explorerProps`/
  `onOpenSearchResult` left-only.
- `apps/desktop/src/panels/LeftPopout.tsx` — construct only the left context.
- `apps/desktop/src/panels/RightPopout.tsx` — construct only the right context; remove
  the fabricated `WorkspaceExplorerProps` and no-op search callback.
- `apps/desktop/src/panels/panelRegistry.test.tsx` — compile/runtime coverage for both
  context shapes and factory invocation on each side.

## Reproduction / verification

- Render `RightPopout` with the current code and inspect the context: it contains
  `initialWorkspacePath: null`, empty recents, and no-op callbacks that do not describe
  the active shell state.
- Register a right-side test contribution whose factory attempts to access a left-only
  field; verify TypeScript rejects it. Register valid left and right factories and
  verify they receive their expected context at runtime.
- Run focused panel tests, `pnpm typecheck`, and `pnpm lint`.

## Acceptance criteria

- [ ] Right-side factories cannot type-check against explorer/search-only fields, and
      no fake left context is constructed in `RightPopout`.
- [ ] Left-side factories retain the real explorer/search state and callbacks.
- [ ] Existing built-in outline, backlinks, properties, assistant, explorer, search,
      source-control, tags, and extensions panels render as before.
- [ ] Panel availability metadata and unavailable-state rendering are unchanged.

## Manual checks

- Open Explorer and Search and verify workspace/file actions still work.
- Switch among Outline, Properties, Backlinks, and Assistant with and without an active
  document; confirm the right popout remains stable and its title/content are unchanged.

## Automated tests

- Type-level contribution fixtures for left-only/right-only context fields.
- Panel registry tests for factory invocation, side filtering, and unavailable panels.

## Non-goals

- Do not redesign the extension panel API or add panel capabilities.
- Do not change panel selection typing; that is tracked separately in
  `pending-narrow_shell_panel_ids-low-med.md`.
- Do not change visual layout, titles, availability semantics, or mounting behavior.
