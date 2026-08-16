# Story 5: Settings Search/Filter

## Epic

Part of [Modular Settings System](./pending-modular_settings_system-med-hard.md).
Read that file first for the 10 binding design decisions and architecture
overview. Also read [Story 3](./pending-settings-tab-nav-controls-high-hard.md)
(tab UI).

## Goal

Add a search input at the top of the settings left nav that filters settings
by label, description, and key. Matching settings are shown in a flat results
list. Clicking a result navigates to its section and highlights the setting.

## Scope

**In scope:**
- Search input at the top of the left nav.
- Filter logic: matches against setting `label`, `description`, and full key
  (case-insensitive substring).
- Flat results list replacing the nav tree when a search query is active.
- Clicking a result: clears the search, navigates to the setting's section,
  and highlights the setting (brief visual emphasis).
- Search query stored in `settingsStore.searchQuery` (already in the store
  from story 2).
- Escape clears the search and restores the tree view.

**Out of scope:**
- Fuzzy matching (substring is sufficient for now).
- Search history.
- Search within setting values.

## Acceptance Criteria

- [ ] Search input renders at the top of the left nav, above the section tree.
- [ ] Typing a query filters all settings in the registry by label,
      description, and full key (case-insensitive substring match).
- [ ] When a query is active, the nav tree is replaced by a flat results list
      showing matching settings (label + module/section path).
- [ ] Empty query restores the normal tree view.
- [ ] Clicking a search result: clears the query, navigates to the setting's
      section in the tree, and briefly highlights the setting row in the
      content area.
- [ ] Escape key in the search input clears the query and restores the tree.
- [ ] "No results" message when the query matches nothing.
- [ ] Search is case-insensitive.
- [ ] Component tests for: search filtering, results list rendering, result
      click navigation, escape clears search, no results state.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.

## File References

- `apps/desktop/src/settings/SettingsNav.tsx` — left nav from story 3.
- `apps/desktop/src/settings/settingsStore.ts` — store from story 2 (has
  `searchQuery` and `setSearchQuery`).
- `packages/core/src/settings/registry.ts` — registry for searching all
  definitions.

## Implementation Notes

- The search should query the registry directly (not just the visible
  sections). All registered settings are searchable.
- Each result should show the setting label and its module/section path
  (e.g. "Font size · Editor > Display") for context.
- The highlight on the setting row after navigation can be a brief CSS
  animation (e.g. `animate-[highlight_1s_ease-in-out]` or a temporary class
  that fades out). Keep it simple.
- Use `Search` icon from lucide-react for the search input prefix.
