# UI Shell

> The desktop UI shell is a visual/interaction specification translated to the
> established React, Tauri, and shared-token architecture.

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

- Domain state stays in `appStore`; a focused layout/tab store holds
  presentation state (active views, bottom panel, palette, tabs, widths).
  Preferences persist via the settings/Tauri path to OS app-data — never in
  the vault.
- Boundaries: `shell/` (TitleBar, ActionBar, StatusBar, ResizeHandle),
  `panels/` (LeftPopout, RightPopout, BottomPanel), `tabs/` (registry,
  TabStrip, views), `native/` bridges, and stores under `apps/desktop/src/`.
- `packages/core/src/layout/` owns platform-neutral `TabKind`, `Tab`, layout
  preferences, and registry contracts; React components register only in
  `apps/desktop/src/tabs/`. Extensions add tab kinds via the contribution API,
  not by mutating the base registry.
- First-party tab kinds: `editor`, `preview`, `settings`; `graph` and
  `browser` are registered unavailable stubs — `browser` needs a separate
  security/capability/CSP decision before any webview ships.
- Chrome surfaces use `--tn-*` tokens in `packages/ui/src/styles/tokens.css`
  (light + dark). Panel widths are pixel state applied via scoped CSSOM
  custom properties (`--tn-shell-left-width`, `--tn-shell-right-width`).
- Command palette: command registry + real workspace file results;
  `Ctrl/Cmd+P`, arrows, Enter, Escape. Closing a tab picks its nearest
  neighbor and prompts before discarding a dirty editor. Resize handles use
  pointer capture, keyboard resizing, min/max widths, double-click reset.
  Theme changes update the persisted setting + `data-thinkbrain-theme`.
- Right popout owns outline/properties; backlinks consume index data when
  graph/indexing exposes it. The assistant panel is an integration point for
  the `ai` epic, not a hand-built chat UI.

## Status

Shipped stories are summarized in `plans/ui-shell/done-summary.md`.

- ✅ fresh-shell startup, browser harness, Explorer visibility, workspace
  restoration, fresh shell rebuild, desktop shell composition
- ✅ tab model, registry, and tab strip
- ✅ left popout, inspector/right popout, command palette + workspace file
  navigation, resizable layout with OS app-data persistence, theme control,
  bottom panel framework
- ✅ `generic_file_viewers` — code editor + image/audio/video viewer tabs
- ✅ semi-preview markdown editor — `apps/desktop/src/tabs/livePreview/`
- ✅ `modular_settings_system` — declarative, auto-populating settings tab
- 🟨 shell token consolidation — production JSX uses shared `--tn-*` tokens;
  expanding the token set remains in
  `theme-foundation/token_system_consolidation`
- ⬜ `contextual_action_items` — filter right-panel contributions by context
- ⬜ `panel_chrome_row_rule` — one chrome row per panel
- ⬜ `file_viewer_architecture_brainstorm` — viewer architecture exploration
- ❌ `workspace_selector_portal_simplify` — superseded by
  `lift_workspace_switching` (see done-summary `## Cancelled`)
