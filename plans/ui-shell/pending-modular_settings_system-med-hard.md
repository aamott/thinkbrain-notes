# Modular Settings System

## Goal

Declarative, modular settings architecture scaling to hundreds of settings.
Adding a setting = defining its schema in one place; UI, persistence, and
validation auto-populate. Modular so many settings update independently, with
customization for dozens of input types and custom HTML/CSS when needed.

## Design Decisions

Binding for all sub-stories.

1. **Scope:** Single registry, `scope: "app" | "workspace"` per definition. UI
   groups by scope as top-level nav ("Application" / "Workspace").
2. **Registration:** Module-based. Each `SettingsModule` is self-contained
   (sections/subsections/settings). Extensions register a whole module at once.
3. **Custom inputs:** Hybrid. Standard types auto-generate controls. Custom
   inputs use a `control` key mapping to a registered React component.
   Definitions stay pure data (no React in definitions).
4. **Save:** Single Save button in the header bar (matching
   `WorkspaceHeaderBar`). Changes stage in memory. Reset reverts to last-saved.
   One write per save. Export/import buttons also in the header bar.
   Consistent across desktop, narrow, and phone.
5. **Tab placement:** Normal tab in the main editor area. Left nav
   (section/subsection tree) + content area (controls).
6. **Import/export:** Full app-settings export to JSON via Tauri save dialog.
   Import validates and stages. Path-type settings marked `portable: false`
   with export warning. Per-section "Reset to defaults" button.
7. **Versioning/migration:** Central migration list (existing pattern).
   Extension-registered migrations via registry API — later.
8. **Dirty indicator:** Reuse existing tab dirty-state dot + DirtyCloseDialog
   on close.
9. **Keyboard navigation:** Semantic HTML + ARIA roles (Tab, Enter, Escape).
   Full arrow-key tree nav is a follow-up.
10. **Extension isolation:** Module ID as namespace. Keys relative within
    module. Registry auto-composes `moduleId.key`. Module ID uniqueness
    enforced on registration.
11. **Responsive nav:** Below 760px, left nav collapses. A hamburger button in
    the content area (top-left) slides the nav in as an overlay. The hamburger
    fades when the nav opens. An ✕ button on the right side of the nav panel
    (next to search) closes it. Tap scrim or Escape also closes. Above 760px,
    two-pane layout restores.
12. **Single-page, no bounce:** Click-to-select nav sets the active section.
    Active section highlighted via `aria-current`, styled with theme tokens.
    Scrolling content preserves the highlight — deterministic.
13. **Search:** Fuzzy match against label, description, and full key. Debounce
    input, virtualize results list. Feels instant with hundreds of settings.
14. **Phone-friendly:** Touch targets ≥44px. Content stacks single-column.
    PathControl's browse button uses native mobile picker where available.

## Architecture Overview

### Core types (`packages/core/src/settings/`) — done

- `types.ts` — `SettingDefinition`, `SettingsModule`, `SettingType`,
  `SettingScope`, `SettingSection`, control key types, `portable` field.
- `registry.ts` — `SettingsRegistry`: collects modules, auto-composes
  `moduleId.key`, enforces uniqueness, collects migrations.
- `defaults.ts` — extracts default values per scope.
- `validation.ts` — runs validators, returns diagnostics.
- `index.ts` — re-exports.
- `modules/` — built-in modules (appearance, editor, sync).
- `dynamic.ts` — dynamic key-value persistence (parse/serialize/migrate).

### Desktop UI (`apps/desktop/src/settings/`) — partially done

- `SettingsTab.tsx` — main tab. Currently two-pane (nav + content + save bar).
  Needs: header bar with Save/export/import, responsive hamburger.
- `SettingsNav.tsx` — left nav tree with search. Currently substring search.
  Needs: fuzzy matching, virtualized results, hamburger slide-in below 760px.
- `SettingsContent.tsx` — renders controls for the selected section.
  Section header has Reset button. Needs: touch targets, single-column on phone.
- `SettingsSaveBar.tsx` — sticky save/reset bar with export/import. Will be
  removed; Save/export/import move to header bar.
- `settingsStore.ts` — Zustand store. Done.
- `controlRegistry.ts` — maps control keys to React components. Done.
- `controls/` — standard + custom controls. Done.

### Persistence — done

App settings: `read_app_settings` / `write_app_settings` Rust commands.
Workspace settings: `read_workspace_settings` / `write_workspace_settings`.
`AppSettings` is a dynamic key-value store backed by the registry.

## Stories

| # | Story | Status | Depends on |
|---|-------|--------|------------|
| 1 | `settings-core-types-registry` | done | — |
| 2 | `settings-store-persistence` | done | 1 |
| 3 | `settings-responsive-header` | pending | 1, 2 |
| 4 | `settings-header-save-dirty` | pending | 3 |
| 5 | `settings-fuzzy-search` | pending | 3 |
| 6 | `settings-import-export-reset` | done | 2, 3 |

## Dependencies

- `ui-shell` tab registry (done) — settings opens as a tab.
- `ui-shell` shell theme control (done) — theme switching works, reads from
  the settings store.

## Notes

- `desktopState.ts` (panel widths, recent workspaces, explorer open) is
  separate from app settings — stays as-is.
- Extensions contribute settings modules via the registry. Built-in modules:
  Appearance, Editor, Sync.
- Full arrow-key nav: follow-up polish story.
- Per-module export: follow-up if requested.
