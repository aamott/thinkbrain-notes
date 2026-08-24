# Story 5: Settings Fuzzy Search + Virtualization

## Status

Done — settings search now uses ranked fuzzy matching, commits input after a
150ms debounce, and virtualizes the flat result list.

## Epic

Part of [Modular Settings System](./pending-modular_settings_system-med-hard.md).
Read that first for the 14 binding design decisions and architecture overview.
Also read [Story 3](./done-settings-responsive-header-high-hard.md).

## Context

Settings search exists in `SettingsNav.tsx` — case-insensitive substring match
on label, description, and full key. Works but won't scale past ~100 settings.
This story upgrades to fuzzy matching and virtualizes the results list so
search feels instant with hundreds of settings.

## Scope

**In scope:**
- Replace substring match with fuzzy matching (ranked by match quality).
- Virtualize the results list so only visible rows render.
- Debounce input (≤150ms).
- Update `SettingsSearch.test.tsx` for fuzzy matching and virtualization.

**Out of scope:** Search history, search within setting values.

## Acceptance Criteria

- [x] Fuzzy match against label, description, and full key. Results ranked
      best-first.
- [x] With 500+ settings, typing stays smooth. Input debounced (≤150ms).
      Results list virtualized — only visible rows in DOM.
- [x] Existing behavior preserved: flat results list, click navigates to
      section + highlights setting, Escape clears, "No results" message.
- [x] `SettingsSearch.test.tsx` updated for fuzzy matching + virtualization.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.

## File References

- `apps/desktop/src/settings/SettingsNav.tsx` — search input + filter logic.
- `apps/desktop/src/settings/SettingsSearch.test.tsx` — search tests.
- `packages/core/src/settings/registry.ts` — registry for searching.

## Implementation Notes

- Fuzzy matching: check `package.json` for an existing dependency (`fuse.js` or
  similar). If none, use a lightweight subsequence scorer. Match label
  (highest weight), description, full key (lowest weight).
- Virtualization: add `@tanstack/react-virtual` (pinned version, published
  >7 days) if not already a dependency.
- Debounce search input by 150ms. `setSearchQuery` called on debounced value.
- On phone (nav is slide-in per story 3), search input is at the top of the
  slide-in panel.
