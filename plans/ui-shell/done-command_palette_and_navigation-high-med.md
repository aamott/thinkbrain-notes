# Command Palette and Navigation

## Goal

Ship a keyboard-accessible command/file palette based on real commands and
workspace files, replacing the mockup's static command list.

## Acceptance Criteria

- [x] `Ctrl/Cmd+P` toggles the palette; Escape, backdrop, arrow keys, Enter,
      initial focus, and focus restoration work correctly.
- [x] A typed command registry includes open file, new note, search, theme,
      sidebar/panel toggles, settings, rebuild index, and feature-owned
      unavailable commands with their prerequisites.
- [x] File results are sourced from workspace state and opening one follows the
      tab/dirty-state contract.
- [x] Filtering is deterministic, handles no results, and has unit/component
      tests for command execution and keyboard navigation.
- [x] The overlay uses a CSS Module, `dialog` semantics, and shared focus/error
      tokens.

## References

- `mockup_v3/src/components/CommandPalette.tsx`
- `apps/desktop/src/commands/`
- `apps/desktop/src/shell/DesktopShell.tsx`
- `apps/desktop/src/workspace/ReadOnlyWorkspaceExplorer.tsx`

## Implementation

The fresh command registry is renderer-neutral and owns availability,
prerequisites, deterministic filtering, and keyboard decisions. The shell
binds those intents to real panels, theme, settings, new-note focus, and
workspace-backed Markdown file results. The overlay restores focus after a
cancel and leaves focus with the selected target after an action.
