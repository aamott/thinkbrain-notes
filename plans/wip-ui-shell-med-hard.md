# UI Shell

> The desktop UI shell is a visual/interaction specification translated to the
> established React, CSS Module, Tauri, and shared-token architecture.

## Goal

Deliver a desktop workspace shell with tabs, inspectable side panels, a
command palette, persistent resizable panes, and a compact status/bottom-panel
experience. Existing explorer, search, settings, and editor features must be
reused rather than recreated from mock data.

## Scope

**In scope:** shell chrome; token migration; left/right popouts;
pluggable tabs; command palette; theme control; resizable layout persistence;
and the bottom panel.

**Out of scope:** moving arbitrary action buttons between slots, drag/drop
layout editing, full Git/tags/extensions/graph/backlink implementations,
browser embedding, terminal execution, and AI behavior. Those surfaces either
show an intentional unavailable state or integrate their owning epic.

## Architecture

### Shell state and component boundaries

Keep domain state in the existing `appStore` and add a focused layout/tab slice
or store for presentation state: active left/right view, bottom panel,
command palette, tabs, active tab, and panel widths. Persist user preferences
through the existing settings/Tauri path to OS app-data. Do not persist open
document contents or any layout data in the vault.

Organize the shell into these boundaries:

```text
apps/desktop/src/
  shell/       TitleBar, ActionBar, StatusBar, ResizeHandle, shell root
  panels/      LeftPopout, RightPopout, BottomPanel
  tabs/        tab types, registry, TabStrip, editor/preview/settings views
  adapters/    Tauri/settings bridges used by shell and AI features
  stores/      app/domain state plus layout and tab state
```

`packages/core/src/layout/` defines platform-neutral `TabKind`, `Tab`, layout
preferences, and registry contracts. React components are registered only in
`apps/desktop/src/tabs/`; the core registry never imports React or desktop
implementations. Future extensions may add tab registrations through the
extension contribution API, not by mutating the base registry.

The first-party tab kinds are `editor`, `preview`, and `settings`; `graph` is a
registered unavailable stub until the graph epic owns it. `browser` is also a
registered unavailable stub—do not ship a raw iframe or give unreviewed remote
content a Tauri webview. A browser implementation needs a separate security
decision and capability/CSP design.

### Panels and dependencies

The left popout wires the existing `WorkspaceExplorer`, `SearchPanel`, and
settings surfaces (`SettingsContent`/`ThemeSectionControls`); source control is a
status-aware `git-integration` boundary,
and tags/extensions remain unavailable until their epics are active. The right
popout owns outline/properties presentation; backlinks consume index data only
when the graph/indexing work exposes it. The assistant panel is an integration
point for the `ai` epic, not a hand-built chat UI.

### Tokens, styling, and dynamic dimensions

Keep chrome surfaces in `packages/ui/src/styles/tokens.css`
using the `--tn-*` prefix, with light and dark values for title bar, activity
bar, sidebar, editor, panel, status bar, and active/inactive tabs. Translate
Tailwind utility classes into co-located CSS Modules backed by those variables;
keep only reset, app root, and third-party editor overrides global. The current
production source still uses utility classes, so this migration remains pending.

Panel widths are state in pixels, clamped in the resize controller and applied
to the shell root with scoped CSSOM custom properties. This is the approved
dynamic-value exception to the no-inline-style rule: `setProperty` updates only
`--tn-shell-left-width` and `--tn-shell-right-width`; CSS Modules provide their
defaults and hidden-panel values.

### Interaction and accessibility

The command palette uses a command registry and real workspace file results;
its keyboard contract is `Ctrl/Cmd+P`, arrows, Enter, and Escape. Closing the
active tab chooses its nearest neighbor and prompts before discarding a dirty
editor. Resize handles use pointer capture/window-level cleanup, keyboard
resizing, minimum/maximum widths, and double-click reset. Theme changes update
the persisted app setting and `data-thinkbrain-theme`.

## Status

- ✅ fresh-shell startup and browser-harness wiring
- ✅ persisted Explorer visibility and workspace restoration
- ✅ fresh shell rebuild
- ⬜ shell token and CSS Module migration — production JSX still uses Tailwind
  utility classes; see
  `plans/theme-foundation/pending-surface_styling_migration-med-med.md`
- ✅ desktop shell composition (panel separation) — rebuilt after the earlier
  rollback
- ✅ tab model, registry, and tab strip
- ✅ left popout integration
- ✅ inspector/right popout integration
- ✅ command palette and workspace file navigation
- ✅ resizable layout and OS app-data persistence
- ✅ theme control in the new shell
- ✅ bottom panel framework and status integration
- ⬜ generic file viewer tabs (code editor, image/audio/video viewers) — see
  `plans/ui-shell/pending-generic_file_viewers-med-med.md`
- ✅ semi-preview markdown editor (live preview with inline source on focus);
  implementation lives in `apps/desktop/src/tabs/livePreview/`; its design docs
  were reviewed and deleted per the plan-review policy in `AGENTS.md`.
- ⬜ modular settings system (declarative, auto-populating settings tab) — see
  `plans/ui-shell/pending-modular_settings_system-med-hard.md`
- ❌ prior movable-action/slot and layout-editing stories were superseded and
  removed.
