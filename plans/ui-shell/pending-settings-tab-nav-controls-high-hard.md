# Story 3: Settings Tab UI — Nav + Content + Standard Controls

## Epic

Part of [Modular Settings System](./pending-modular_settings_system-med-hard.md).
Read that file first for the 10 binding design decisions and architecture
overview. Also read [Story 1](./pending-settings-core-types-registry-high-hard.md)
(types/registry) and [Story 2](./pending-settings-store-persistence-high-med.md)
(store/persistence).

## Goal

Build the settings tab UI: left nav tree (module → section → subsection),
content area that auto-generates form controls from definitions, and the
control registry with all standard control components. Replace the current
"Unavailable" placeholder in `TabContent.tsx` with a real settings tab.

## Scope

**In scope:**
- `SettingsTab.tsx` — main tab component with left nav + content area layout.
- `SettingsNav.tsx` — left nav tree. Renders module/section/subsection
  hierarchy. "Application" and "Workspace" top-level groups (workspace only
  when a workspace is open). Active-section highlighting via `aria-current`.
  Collapsible subsections.
- `SettingsContent.tsx` — renders settings for the selected section.
  Auto-generates controls by type, or looks up a registered control by key.
- `controlRegistry.ts` — maps control keys to React components. Standard
  controls pre-registered.
- `controls/ToggleControl.tsx` — boolean toggle switch.
- `controls/TextControl.tsx` — string text input.
- `controls/NumberControl.tsx` — number input with optional min/max.
- `controls/SelectControl.tsx` — enum dropdown.
- `controls/PathControl.tsx` — text input with browse button (Tauri dialog).
- `TabContent.tsx` updated to render `SettingsTab` for `tab.kind === "settings"`.
- Basic keyboard support via semantic HTML + ARIA roles (Tab, Enter, Escape).

**Out of scope:**
- Save bar (story 4).
- Dirty indicator on tab (story 4).
- Validation error display (story 4).
- Search/filter (story 5).
- Import/export (story 6).
- Custom (non-standard) control components — just the registry mechanism and
  standard controls.

## Acceptance Criteria

- [ ] `SettingsTab` renders a two-pane layout: left nav + right content area.
- [ ] `SettingsNav` renders the module → section → subsection tree from the
      registry.
- [ ] "Application" top-level group shows all app-scoped modules. "Workspace"
      top-level group shows workspace-scoped modules (only when a workspace is
      open).
- [ ] Active section is highlighted with `aria-current="true"`.
- [ ] Subsections are collapsible (click to expand/collapse).
- [ ] `SettingsContent` renders the settings for the selected section,
      showing each setting's label, description, and control.
- [ ] Auto-generated controls by type:
      - Boolean → `ToggleControl` (toggle switch).
      - Enum → `SelectControl` (dropdown).
      - String → `TextControl` (text input).
      - Number → `NumberControl` (number input with min/max if specified).
      - Path → `PathControl` (text input + browse button).
- [ ] `controlRegistry` maps control keys to React components. If a
      definition has a `control` key, the registered component is used instead
      of the auto-generated one.
- [ ] Control changes call `settingsStore.stageChange(key, value)` — no
      immediate save.
- [ ] Controls reflect the current staged value (if staged) or the loaded
      value.
- [ ] `TabContent.tsx` renders `SettingsTab` instead of the Unavailable
      placeholder for `tab.kind === "settings"`.
- [ ] Left nav is a `role="tree"` with `role="treeitem"` entries. Controls
      are standard form elements in the native tab order.
- [ ] Built-in settings (theme, fontSize, lineWrapping) render with working
      controls and stage changes in the store.
- [ ] Production settings UI styling uses co-located CSS Modules backed by shared
      `--tn-*` tokens, with no Tailwind utility classes or inline styles. This
      styling migration remains pending and is cross-referenced with
      `plans/theme-foundation/pending-surface_styling_migration-med-med.md`.
- [ ] Component tests for: nav tree rendering, active section highlighting,
      control auto-generation by type, control registry override, stageChange
      on control interaction.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.

## File References

- `apps/desktop/src/shell/TabContent.tsx` — currently renders Unavailable for
  settings tab; will render `SettingsTab`.
- `apps/desktop/src/settings/settingsStore.ts` — store from story 2.
- `packages/core/src/settings/registry.ts` — registry from story 1.
- `packages/core/src/settings/types.ts` — types from story 1.
- `apps/desktop/src/lib/utils.ts` — `cn` for class merging.
- `packages/ui/src/styles/tokens.css` — shared `--tn-*` token source of truth.
- `plans/theme-foundation/pending-surface_styling_migration-med-med.md` —
  binding CSS Modules/shared-token surface migration.
- `apps/desktop/src/agent/AssistantPanel.tsx` — popover pattern reference.

## Implementation Notes

- Use co-located CSS Modules backed by shared `--tn-*` tokens for all
  production styling; do not add Tailwind utility classes or inline styles.
  No hardcoded RGB values. The existing surface-styling migration story remains
  the source of truth for completing this migration.
- Use `cn` from `../lib/utils` for conditional class merging where needed.
- Use lucide-react icons for any icons (e.g. `ChevronRight`/`ChevronDown` for
  collapsible subsections).
- The left nav should be scrollable (overflow-y-auto) for long section lists.
- The content area should be scrollable for long setting lists.
- PathControl's browse button should use a Tauri open dialog. Check
  `apps/desktop/src/native/commands.ts` for existing dialog commands. If none
  exist, render the browse button as disabled with a tooltip "File browser
  not yet available" — don't break the build.
- Keep components under 500 lines. Extract sub-components if needed.
- The `SettingsTab` should read from `settingsStore` via Zustand hooks.
- Empty state: if no section is selected, show a prompt to select a section
  from the nav.
