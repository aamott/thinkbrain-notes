# Modular Settings System

## Goal

Replace the current minimal settings implementation with a declarative,
modular settings architecture that scales to thousands of settings. Adding a
new setting should be as simple as defining its schema in one place — the UI,
persistence, and validation auto-populate from the definition. The system must
remain modular so that many settings can be updated independently, while
allowing enough customization to handle dozens of input types and edge cases,
including custom HTML/CSS for setting inputs when needed.

## Design Decisions

These decisions are binding for all sub-stories. Each story file references
this epic for context.

1. **Scope separation:** Single registry with `scope: "app" | "workspace"` on
   each definition. UI groups by scope as top-level nav sections
   ("Application" / "Workspace"). No hierarchical inheritance — upgradable
   later.

2. **Registration:** Module-based. Each `SettingsModule` is a self-contained
   object with sections/subsections/settings. The registry collects modules.
   Extensions register a whole module at once.

3. **Custom inputs:** Hybrid. Standard types auto-generate controls. Custom
   inputs use a `control` key that maps to a registered React component.
   Definitions stay pure data (no React components in definitions).

4. **Save behavior:** Single Save button. Changes stage in memory. Reset/
   Discard reverts to last-saved. One write per save action.

5. **Tab placement:** Normal tab in the main editor area. Left nav
   (section/subsection tree) + content area (controls). Not a modal.

6. **Import/export:** Full app-settings export to JSON via Tauri save dialog.
   Import validates and stages. Path-type settings marked `portable: false`
   with export warning. Per-section "Reset to defaults" button.

7. **Versioning/migration:** Central migration list (existing pattern).
   Extensions register migrations through registry API later.

8. **Dirty indicator:** Reuse existing tab dirty-state dot + DirtyCloseDialog
   on close.

9. **Keyboard navigation:** Basic support via semantic HTML + ARIA roles
   (Tab, Enter, Escape). Full arrow-key tree nav is a follow-up.

10. **Extension isolation:** Module ID as namespace. Keys are relative within
    module. Registry auto-composes `moduleId.key`. Module ID uniqueness
    enforced on registration.

## Architecture Overview

### Core types (`packages/core/src/settings/`)

- `types.ts` — `SettingDefinition`, `SettingsModule`, `SettingType`,
  `SettingScope`, `SettingSection`, control key types, `portable` field.
- `registry.ts` — `SettingsRegistry` collecting modules, auto-composing full
  keys (`moduleId.key`), enforcing module ID uniqueness, collecting migrations.
- `defaults.ts` — extracts default values per scope.
- `validation.ts` — runs validators, returns diagnostics.
- `index.ts` — re-exports.
- `modules/` — built-in settings modules (appearance, editor).
- Existing `packages/core/src/settings.ts` (parse/serialize/migrate) stays as
  the persistence layer.

### Desktop UI (`apps/desktop/src/settings/`)

- `SettingsTab.tsx` — main tab component (left nav + content area).
- `SettingsNav.tsx` — left nav tree with active-section highlighting.
- `SettingsContent.tsx` — renders controls for the selected section.
- `SettingsSaveBar.tsx` — sticky save/reset bar.
- `settingsStore.ts` — Zustand store (loaded values, staged changes, dirty
  state, active section, search query).
- `controlRegistry.ts` — maps control keys to React components.
- `controls/` — standard controls (toggle, text, number, select, path).

### Persistence

App settings: existing `read_app_settings` / `write_app_settings` Rust
commands. Workspace settings: existing `read_workspace_settings` /
`write_workspace_settings` Rust commands. The `AppSettings` interface evolves
from a fixed shape to a dynamic key-value store backed by the registry.

## Stories

| # | Story | Status | Depends on |
|---|-------|--------|------------|
| 1 | `settings-core-types-registry` | pending | — |
| 2 | `settings-store-persistence` | pending | 1 |
| 3 | `settings-tab-nav-controls` | pending | 1, 2 |
| 4 | `settings-save-dirty-validation` | pending | 2, 3 |
| 5 | `settings-search-filter` | pending | 3 |
| 6 | `settings-import-export-reset` | pending | 2, 3 |

## Dependencies

- `ui-shell` tab registry (done) — settings already opens as a tab.
- `ui-shell` shell theme control (done) — theme switching works, needs to
  react to the new settings store.

## Notes

- The existing `AppSettings` interface is a fixed shape (`theme`, `editor`).
  The new system makes settings dynamic (key-value backed by registry) while
  preserving the parse/serialize/migrate infrastructure.
- The `desktopState.ts` (panel widths, recent workspaces, explorer open) is
  separate from app settings and stays as-is.
- Extensions will eventually contribute settings modules. For now, only
  built-in modules exist (Appearance, Editor).
- Full arrow-key navigation of the left nav tree is a follow-up polish story.
- Per-module export is a follow-up if users request it.
