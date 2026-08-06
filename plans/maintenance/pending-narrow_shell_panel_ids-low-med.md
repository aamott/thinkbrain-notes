# Narrow Desktop Shell Panel IDs

## Goal

Restore compile-time safety for shell selection state while leaving registry IDs open
for future extension contributions. A typo in built-in shell state should be a type
error; arbitrary extension IDs may still be registered and looked up by the registry,
but extension selection is not implemented by this story.

## Files

- `apps/desktop/src/panels/panelRegistry.tsx` — retain a wide registry lookup ID for
  extension contributions, but define narrow `BuiltInLeftPanel` and `BuiltInRightPanel`
  unions from the actual side-specific built-ins. Keep `DesktopPanelId` wide only where
  registry registration/lookup requires it.
- `apps/desktop/src/shell/shellTypes.ts` — re-export the narrow shell selection types.
- `apps/desktop/src/shell/DesktopShell.tsx` and `apps/desktop/src/shell/ActivityBar.tsx`
  — use the narrow unions for state and selection callbacks; handle registry entries
  without widening those callbacks (for example, by narrowing built-in side entries
  before handing them to shell state).
- `apps/desktop/src/panels/LeftPopout.tsx`, `RightPopout.tsx`, and relevant
  `panelRegistry.test.tsx`/`DesktopShell.test.tsx` — update prop types and regression
  coverage.

## Reproduction / verification

- Before the fix, `setLeftPanel("exlorer")` and `setRightPanel("propeties")` compile
  because `LeftPanel`/`RightPanel` are `DesktopPanelId = BuiltInDesktopPanelId |
  (string & {})`.
- Add compile-time fixtures asserting misspelled built-in IDs are rejected while a
  separately registered extension ID remains valid for `desktopPanelRegistry.get()`.
- Run focused shell/panel tests, `pnpm typecheck`, and `pnpm lint`.

## Acceptance criteria

- [ ] Shell state, toggle/select callbacks, and popout props accept only valid
      built-in IDs for their respective side.
- [ ] Registry registration and lookup continue to accept extension-owned string IDs.
- [ ] Left/right built-in lists cannot accidentally cross sides at compile time.
- [ ] Existing panel toggles, persisted Explorer restoration, and unavailable fallback
      behavior remain unchanged.

## Manual checks

- Click every activity-bar and right-inspector button, including unavailable Tags,
  Extensions, and Backlinks entries.
- Reload with Explorer visibility persisted and verify the same panel opens.
- Confirm an extension-style registry ID can be registered/looked up without making it
  a selectable shell state.

## Automated tests

- Type-level invalid-ID fixtures for left/right shell state.
- Desktop shell tests for toggle/restore behavior and panel registry tests for wide
  extension lookup plus narrow built-in side filtering.

## Non-goals

- Do not implement extension-owned panel selection, persistence, or navigation.
- Do not remove the wide registry ID or change contribution ID canonicalization.
- Do not change panel UI, availability, or render fallback behavior.
