# UI Shell

> Adopt `mockup_v3/` as the desktop UI reference. It is a visual/interaction
> specification, not production code: translate it to the established React,
> CSS Module, Tauri, and shared-token architecture.

## Goal

Deliver a desktop workspace shell with tabs, inspectable side panels, a
command palette, persistent resizable panes, and a compact status/bottom-panel
experience. Existing explorer, search, settings, and editor features must be
reused rather than recreated from mock data.

## Scope

**In scope:** mockup-v3 shell chrome; token migration; left/right popouts;
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

Translate the mockup into these boundaries:

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
`SettingsPanel`; source control is a status-aware `git-integration` boundary,
and tags/extensions remain unavailable until their epics are active. The right
popout owns outline/properties presentation; backlinks consume index data only
when the graph/indexing work exposes it. The assistant panel is an integration
point for the `ai` epic, not a hand-built chat UI.

### Tokens, styling, and dynamic dimensions

Merge the mockup's chrome surfaces into `packages/ui/src/styles/tokens.css`
using the `--tn-*` prefix, with light and dark values for title bar, activity
bar, sidebar, editor, panel, status bar, and active/inactive tabs. Replace the
monolithic `apps/desktop/src/styles.css` shell rules with co-located CSS
Modules; keep only reset, app root, and third-party editor overrides global.

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

- ✅ fresh-shell startup and browser-harness wiring — see
  `plans/ui-shell/done-fresh_shell_launch_wiring-high-med.md`
- ✅ persisted Explorer visibility and workspace restoration — see
  `workspace-explorer/done-fresh_shell_workspace_open-high-med.md`
- ✅ a new shell rebuild from `mockup_v3/` is complete — see
  `plans/ui-shell/done-mockup_v3_shell_rebuild-high-hard.md`
- ✅ shell token and CSS Module migration — see
  `plans/ui-shell/done-shell_tokens_and_css_modules-high-hard.md`
- ⬜ desktop shell composition (panel separation) — rolled back by `b2124ee "UI
  Cleanup"`; see `plans/ui-shell/pending-desktop_shell_composition-high-hard.md`
- ✅ tab model, registry, and tab strip — see
  `plans/ui-shell/done-tab_content_registry-high-hard.md`
- ⬜ left popout integration — see
  `plans/ui-shell/pending-left_popout_integration-high-med.md`
- ⬜ inspector/right popout integration — see
  `plans/ui-shell/pending-right_popout_inspectors-med-med.md`
- ✅ command palette and workspace file navigation — see
  `plans/ui-shell/done-command_palette_and_navigation-high-med.md`
- ⬜ resizable layout and OS app-data persistence — see
  `plans/ui-shell/pending-resizable_panel_persistence-med-med.md`
- ⬜ theme control in the new shell — see
  `plans/ui-shell/pending-shell_theme_control-high-easy.md`
- ⬜ bottom panel framework and status integration — see
  `plans/ui-shell/pending-bottom_panel_framework-low-med.md`
- ⬜ generic file viewer tabs (code editor, image/audio/video viewers) — see
  `plans/ui-shell/pending-generic_file_viewers-med-med.md`
- ⬜ semi-preview markdown editor (live preview with inline source on focus) — see
  `plans/ui-shell/pending-semi_preview_editor-med-hard.md`
- ⬜ modular settings system (declarative, auto-populating settings tab) — see
  `plans/ui-shell/pending-modular_settings_system-med-med.md`
- ❌ prior movable-action/slot and layout-editing stories described `mockup2.htm`,
  not `mockup_v3/`; they were superseded and removed.
