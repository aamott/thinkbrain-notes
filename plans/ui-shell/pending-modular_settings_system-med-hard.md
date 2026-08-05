# Modular Settings System

**Status:** pending · **Urgency:** high · **Difficulty:** hard

## Goal

Replace the current minimal settings implementation with a declarative,
modular settings architecture that scales to thousands of settings. Adding a
new setting should be as simple as defining its schema in one place — the UI,
persistence, and validation auto-populate from the definition. The system must
remain modular so that many settings can be updated independently, while
allowing enough customization to handle dozens of input types and edge cases,
including custom HTML/CSS for setting inputs when needed.

## Design Decisions

### Scope separation: Single registry with scope field, UI groups by scope

Each `SettingDefinition` has `scope: "app" | "workspace"`. The left nav's
top-level sections are "Application" and "Workspace" (workspace only appears
when a workspace is open). Under each, the normal section/subsection hierarchy
applies. Persistence routes reads/writes based on scope — app settings to OS
app-data, workspace settings to workspace app-data (not the vault).

**Why not mixed-in-one-view (A):** Mixed scopes in one view are confusing —
users have to read badges to know if a setting is global or per-workspace.

**Why not two separate registries (B):** Double the boilerplate per setting.
If a setting exists at both scopes, it must be defined twice. Doesn't scale.

**Why not hierarchical inheritance (C):** Overkill right now. We don't have
folder-level settings yet, and the override UI adds complexity to every row.
Upgradable to C later without rewriting the registry if folder-level overrides
become a real need.

### Registration: Module-based

Each settings module is a self-contained `SettingsModule` object:

```typescript
export const editorSettingsModule: SettingsModule = {
  id: "editor",
  label: "Editor",
  scope: "app",
  sections: [
    {
      id: "editor.display",
      label: "Display",
      settings: [
        { key: "editor.fontSize", type: "number", label: "Font size", ... },
        { key: "editor.lineWrapping", type: "boolean", label: "Line wrapping", ... },
      ]
    },
    {
      id: "editor.behavior",
      label: "Behavior",
      settings: [...]
    }
  ]
};
```

The registry collects modules. Extensions register a whole module at once.
The hierarchy (module → section → subsection → setting) maps directly to the
left nav.

**Why not static array (A):** Flat arrays don't encode hierarchy. With
thousands of settings, a flat list is unmanageable.

**Why not functional registration (B):** Harder to tree-shake, registration
side-effects, and for mostly-static settings it's ceremony with no payoff.

### Custom inputs: Hybrid (auto-generate + control key)

Standard types (`boolean`, `string`, `number`, `enum`, `path`) auto-generate
their controls from the definition. For custom inputs, the definition has a
`control` key that maps to a registered component:

```typescript
// Standard — auto-generates a toggle, no control key needed
{ key: "editor.lineWrapping", type: "boolean", label: "Line wrapping" }

// Custom — specifies a control key that maps to a registered component
{ key: "theme.accentColor", type: "string", control: "color-picker", label: "Accent color" }
```

Control components are registered separately: `registerControl("color-picker", ColorPickerControl)`.

**Why not optional render field (A):** Definitions would contain React
components, so they can't be serialized, tested in isolation, or shared with
mobile. Breaks the "pure data definition" principle.

**Why not control registry for everything (B):** Boilerplate for standard
types. Every boolean setting would need `control: "toggle"` even though 95%
use the same toggle. Noise across thousands of settings.

### Save behavior: Single save button

Changes are staged in memory until the user clicks Save. A Reset/Discard
option reverts to the last-saved state. One write operation persists all dirty
settings at once. This gives users confidence to experiment with settings
without partial saves, and makes the persistence path simple (one write per
save action).

### Settings tab placement

Opens as a normal tab in the main editor area (not a modal, not a side panel).
The tab has a left nav (section/subsection tree) and a main content area
(setting controls for the selected section). The left nav highlights the
current page and supports nested sections/subsections/sub-subsections.

### Import/export and reset

Full app-settings export writes all app-scoped settings to a single JSON file
via a Tauri save dialog. Import reads a JSON file, validates against the
registry, and stages the values for review before saving. Path-type settings
are marked `portable: false` by default; the export UI warns about
non-portable settings that may not work on another machine.

Each section header has a "Reset section to defaults" button that reverts just
that section's settings to their definition defaults. This handles the "I
messed up one section" case without nuking everything.

Workspace settings are not included in export — they're workspace-specific.

**Why not per-module export:** Over-engineered for now. Most users want "my
settings" as a unit, not piecemeal. Can be added later if users ask.

### Settings versioning and migration

The existing central migration pattern (`APP_SETTING_MIGRATIONS` in
`packages/core/src/settings.ts`) is preserved. A separate
`settingsMigrations: SettingMigration[]` array handles structural changes
(key renames, section moves). Each entry is
`{ fromVersion, toVersion, migrate: (settings: Record<string, unknown>) => Record<string, unknown> }`.

When extensions arrive, they will register migrations through the registry
API. For now, only built-in migrations exist.

**Why not per-setting migrate functions:** With thousands of settings,
migration logic would be scattered. Hard to test holistically. Key renames
(the most common migration case) can't be handled per-setting because the old
key no longer exists. Central migrations handle the real problem.

**Why not hybrid (central + per-setting):** Premature. No setting currently
needs value-level migration. Can be added later if a setting's value format
changes in a way that's not a structural rename.

### Dirty indicator on the tab

The settings tab reuses the existing tab dirty-state infrastructure (the dot
on unsaved file changes). When staged changes exist, the tab shows the dirty
dot. When saved or reset, it clears. Closing the tab while dirty triggers the
existing `DirtyCloseDialog`: "You have unsaved settings changes. Save /
Discard / Cancel?"

**Why not a custom banner inside the settings tab:** Redundant with the save
bar at the bottom. Adds visual noise. Inconsistent with the rest of the app's
dirty-state UX.

### Keyboard navigation

Basic keyboard support is provided via semantic HTML and existing patterns:
the left nav is a `role="tree"` with `aria-current` (matching the workspace
explorer tree pattern). Controls are standard form elements in the native tab
order. The save bar buttons are in the tab order. Escape closes search.

Full arrow-key navigation of the left nav tree (Up/Down to move between
sections, Left/Right to collapse/expand) is a follow-up polish story, not
part of this story's acceptance criteria. The workspace explorer tree already
implements this pattern and can be reused when that follow-up happens.

### Extension settings isolation

Module IDs serve as the namespace. Keys are defined relative to their module:
`{ key: "fontSize", ... }` in the `editor` module becomes `editor.fontSize`
in the flat settings object. Extension modules with ID `ext.journal` produce
keys like `ext.journal.entryFormat`. The registry auto-composes the full key
from `moduleId.key` and enforces module ID uniqueness on registration.

**Why not explicit full keys with uniqueness check:** Extension authors could
accidentally use unprefixed keys. No enforced isolation. Relies on convention.

**Why not enforced `ext.` prefix for extension modules:** Extension authors
must remember a prefixing convention. With module ID as namespace, the
convention is automatic — the module ID is already unique, and the registry
composes the full key.

## Architecture

### Type system (`packages/core/src/settings/`)

The settings type system lives in `packages/core` so mobile can reuse it.
Split into focused files under `packages/core/src/settings/`:

- `types.ts` — `SettingDefinition`, `SettingsModule`, `SettingType`,
  `SettingScope`, `SettingSection`, control key types. `SettingDefinition`
  includes `portable?: boolean` (defaults to `true`; path-type settings
  default to `false`) for import/export portability hints.
- `registry.ts` — `SettingsRegistry` that collects modules and provides
  lookups by full key (`moduleId.key`), by section, and by scope. The
  registry auto-composes full keys from module ID + relative key and
  enforces module ID uniqueness. Extensions call `registry.register(module)`.
  Also collects `SettingMigration[]` entries for central version migration.
- `defaults.ts` — extracts default values from the registry into a flat
  `Record<string, unknown>` per scope.
- `validation.ts` — runs validators from definitions, returns
  `SettingsDiagnostic[]` (reuses existing diagnostic type).
- `index.ts` — re-exports everything.

The existing `packages/core/src/settings.ts` (parse/serialize/migrate) stays
as the persistence layer. The new registry sits above it and feeds it
canonical key paths.

### Desktop UI (`apps/desktop/src/settings/`)

- `SettingsTab.tsx` — the main settings tab component rendered by
  `TabContent.tsx` when `tab.kind === "settings"`. Contains the left nav +
  content area layout.
- `SettingsNav.tsx` — left nav tree. Renders the module/section/subsection
  hierarchy. Highlights the active section. Collapsible subsections.
- `SettingsContent.tsx` — renders the settings for the selected section.
  Auto-generates controls by type, or looks up a registered control by key.
- `SettingsSaveBar.tsx` — sticky save/reset bar at the bottom. Shows dirty
  count. Save writes all changes. Reset reverts to last-saved state.
- `settingsStore.ts` — Zustand store managing: loaded values, staged changes,
  dirty state, active section, search query. Bridges to the persistence layer.
- `controlRegistry.ts` — desktop-side control component registry. Maps
  control keys to React components. Standard controls (toggle, text, number,
  select, path) are pre-registered.
- `controls/` — standard control components: `ToggleControl.tsx`,
  `TextControl.tsx`, `NumberControl.tsx`, `SelectControl.tsx`,
  `PathControl.tsx`.

### Persistence

App settings: existing `read_app_settings` / `write_app_settings` Rust
commands. The settings store loads all app-scoped definitions' defaults,
merges with persisted values, and writes the full app settings JSON on save.

Workspace settings: existing `read_workspace_settings` /
`write_workspace_settings` Rust commands. Same pattern, scoped to the
active workspace.

The existing `AppSettings` interface in `packages/core/src/settings.ts` will
need to evolve from a fixed interface to a dynamic key-value store backed by
the registry. The parse/serialize/migrate infrastructure stays — it just
operates on the registry's key set instead of hardcoded fields.

### Search/filter

A search input at the top of the left nav filters settings by label,
description, and key. Matching settings are shown in a flat results list.
Clicking a result navigates to its section and highlights the setting.

## Acceptance Criteria

- [ ] `SettingDefinition` type in `packages/core` with key, type, label,
      description, default, scope, section, and optional validation.
- [ ] `SettingsModule` type in `packages/core` grouping settings into
      sections and subsections with a scope.
- [ ] `SettingsRegistry` in `packages/core` that collects modules and
      provides lookups by key, section, and scope.
- [ ] Settings tab opens as a normal tab in the main editor area (not a
      modal).
- [ ] Left nav renders the module → section → subsection hierarchy with
      active-section highlighting.
- [ ] "Application" and "Workspace" top-level nav sections, workspace
      appearing only when a workspace is open.
- [ ] Settings content auto-generates form controls from the registry:
      - Boolean → toggle switch
      - Enum → dropdown select
      - String → text input
      - Number → number input with optional min/max
      - Path → text input with browse button
- [ ] Custom control key on a definition maps to a registered React
      component, overriding the auto-generated control.
- [ ] Adding a new standard setting requires only adding a
      `SettingDefinition` to a module — no UI code changes.
- [ ] Adding a new custom-input setting requires registering a control
      component and referencing its key in the definition.
- [ ] Single Save button stages and writes all dirty settings at once.
- [ ] Reset/Discard reverts staged changes to the last-saved state.
- [ ] Search/filter in the left nav finds settings by label, description,
      and key.
- [ ] Settings changes take effect without restart (theme, editor config,
      etc. react to store changes).
- [ ] Validation runs on save; invalid values show inline errors and are
      not persisted.
- [ ] Existing settings (theme, editor font size, editor line wrapping)
      migrate to the new registry-based system.
- [ ] Existing desktop state (panel widths, recent workspaces) continues to
      work alongside the new settings system.
- [ ] Full app-settings export writes all app-scoped settings to a JSON file
      via a Tauri save dialog; import reads, validates, and stages values.
- [ ] Path-type settings are marked `portable: false`; export UI warns about
      non-portable settings.
- [ ] Each section header has a "Reset section to defaults" button that
      reverts just that section's settings to their definition defaults.
- [ ] Settings tab shows a dirty indicator (dot) when staged changes exist;
      closing while dirty triggers the existing DirtyCloseDialog.
- [ ] Settings UI is navigable by keyboard (Tab, Shift+Tab, Enter, Escape)
      via semantic HTML and ARIA roles.
- [ ] Registry auto-composes full keys from module ID + relative key
      (e.g. `editor.fontSize`, `ext.journal.entryFormat`).
- [ ] Registry enforces module ID uniqueness on registration.
- [ ] Central settings migration list handles structural changes (key
      renames, section moves) using the existing migration pattern.

## File References

- `packages/core/src/settings.ts` — existing parse/serialize/migrate
  infrastructure to preserve and evolve.
- `packages/core/src/index.ts` — export entry point for new settings modules.
- `apps/desktop/src/settings/desktopState.ts` — existing desktop state
  persistence (panel widths, recent workspaces). Stays as-is.
- `apps/desktop/src/settings/ThemeProvider.tsx` — must react to theme
  setting changes from the new store.
- `apps/desktop/src/shell/TabContent.tsx` — currently renders an Unavailable
  placeholder for `tab.kind === "settings"`; will render `SettingsTab`.
- `apps/desktop/src/shell/DesktopShell.tsx` — `openSettingsTab` already
  creates a settings tab; no change needed.
- `apps/desktop/src/native/commands.ts` — `read_app_settings`,
  `write_app_settings`, `read_workspace_settings`,
  `write_workspace_settings` all exist.
- `apps/desktop/src-tauri/src/commands/settings.rs` — Rust persistence
  commands, all exist.

## Dependencies

- `ui-shell` tab registry (done) — settings already opens as a tab.
- `ui-shell` shell theme control (done) — theme switching works, needs to
  react to the new settings store.

## Notes

- The existing `AppSettings` interface is a fixed shape (`theme`, `editor`).
  The new system makes settings dynamic (key-value backed by registry) while
  preserving the parse/serialize/migrate infrastructure. Theme and editor
  settings become registry entries with their own definitions.
- The `desktopState.ts` (panel widths, recent workspaces, explorer open) is
  separate from app settings and stays as-is. It's shell layout state, not
  user-facing settings.
- Extensions will eventually contribute settings modules. For now, only
  built-in modules exist (Appearance, Editor). The registry API is designed
  for extension contribution from the start. Extension module IDs should use
  an `ext.` prefix (e.g. `ext.journal`) for clarity in the flat settings
  object, though this is convention, not enforcement.
- Consider lazy-loading settings modules if the registry grows large. For
  now, eager loading is fine — the built-in modules are small.
- Full arrow-key navigation of the left nav tree (Up/Down/Left/Right) is a
  follow-up polish story. The workspace explorer tree already implements this
  pattern and can be reused.
- Per-module export (e.g. "Export Editor settings only") is a follow-up if
  users request it. Full export covers the 80% case for now.
