# Story 3: Settings Responsive Nav + Header Bar

## Epic

Part of [Modular Settings System](./pending-modular_settings_system-med-hard.md).
Read that first for the 14 binding design decisions and architecture overview.

## Context

The settings tab UI exists: `SettingsTab.tsx` renders a two-pane layout (left
nav + content + sticky save bar). `SettingsNav.tsx` has the nav tree and
search. `SettingsContent.tsx` renders controls. All working on desktop.

This story adds the header bar (matching `WorkspaceHeaderBar`) and responsive
behavior (hamburger collapse, phone layout). The sticky `SettingsSaveBar.tsx`
is removed — Save, export, and import move to the header bar.

## Scope

**In scope:**
- Add a header bar to `SettingsTab.tsx`: breadcrumb (active section path) on
  the left, Save + export/import buttons on the right. Matches
  `WorkspaceHeaderBar` pattern.
- Remove `SettingsSaveBar.tsx` and its test. Move Save/export/import logic
  into the header bar.
- Hamburger button in the content area (top-left), visible below 760px. Fades
  out when the nav opens.
- ✕ close button on the right side of the nav panel, next to the search input.
- Slide-in nav panel below 760px: nav slides over the content with a scrim.
  Tap scrim or Escape closes.
- Touch targets ≥44px on phone. Content stacks single-column.
- Update `SettingsTab.test.tsx` for the new layout.
- Update `SettingsSaveBar.test.tsx` — tests move to a header bar test file.

**Out of scope:** Fuzzy search upgrade (story 5), save/dirty/validation wiring
changes (story 4 — the logic moves but the store interaction stays the same).

## Acceptance Criteria

- [ ] Header bar renders below tabs: breadcrumb left, Save + export/import
      buttons right. Matches `WorkspaceHeaderBar` styling.
- [ ] `SettingsSaveBar.tsx` deleted. Save, Reset, export, import logic moved
      to the header bar in `SettingsTab.tsx` (or a new `SettingsHeaderBar.tsx`).
- [ ] `SettingsSaveBar.test.tsx` deleted. Tests rewritten for the header bar.
- [ ] Below 760px: hamburger button appears in the content area (top-left).
      Fades out when nav opens.
- [ ] ✕ button on the right side of the nav panel, next to search. Closes the
      nav.
- [ ] Nav slides in over a scrim. Tap scrim or Escape closes.
- [ ] Above 760px: two-pane layout, hamburger hidden, ✕ hidden.
- [ ] Touch targets ≥44px on phone-width screens.
- [ ] Content stacks single-column on phone.
- [ ] `SettingsTab.test.tsx` updated for new layout.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.

## File References

- `apps/desktop/src/settings/SettingsTab.tsx` — add header bar, restructure
  layout.
- `apps/desktop/src/settings/SettingsSaveBar.tsx` — delete.
- `apps/desktop/src/settings/SettingsSaveBar.test.tsx` — delete, rewrite as
  header bar tests.
- `apps/desktop/src/settings/SettingsNav.tsx` — add slide-in panel, ✕ button.
- `apps/desktop/src/settings/SettingsContent.tsx` — touch targets,
  single-column.
- `apps/desktop/src/shell/WorkspaceHeaderBar.tsx` — header bar pattern.
- `apps/desktop/src/settings/SettingsTab.test.tsx` — update.
- `plans/pending-mobile-med-hard.md` — responsive breakpoint (760px).
- `plans/ui-shell/assets/settings-mockup.html` — visual reference.

## Implementation Notes

- Extract header bar into `SettingsHeaderBar.tsx` if `SettingsTab.tsx` would
  exceed 500 lines.
- Hamburger: `Menu` icon from lucide-react. Fades via opacity transition when
  nav opens. Position: absolute, top-left of the content area.
- ✕ close button: `X` icon from lucide-react. Sits in the nav panel header,
  right of the search input.
- Scrim: fixed/absolute overlay with `--tn-color-overlay`.
- Use the same 760px breakpoint as the shell (per
  `plans/pending-mobile-med-hard.md`).
- Keep the existing autosave logic from `SettingsSaveBar.tsx` — when autosave
  is enabled, Save/Reset hide and an "Autosave enabled" label shows.
- Co-located CSS Modules backed by `--tn-*` tokens. No Tailwind utilities or
  inline styles.
