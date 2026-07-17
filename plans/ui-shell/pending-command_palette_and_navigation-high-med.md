# Command Palette and Navigation

## Goal

Ship a keyboard-accessible command/file palette based on real commands and
workspace files, replacing the mockup's static command list.

## Acceptance Criteria

- [ ] `Ctrl/Cmd+P` toggles the palette; Escape, backdrop, arrow keys, Enter,
      initial focus, and focus restoration work correctly.
- [ ] A typed command registry includes open file, new note, search, theme,
      sidebar/panel toggles, settings, rebuild index, and feature-owned
      unavailable commands with their prerequisites.
- [ ] File results are sourced from workspace state and opening one follows the
      tab/dirty-state contract.
- [ ] Filtering is deterministic, handles no results, and has unit/component
      tests for command execution and keyboard navigation.
- [ ] The overlay uses a CSS Module, `dialog` semantics, and shared focus/error
      tokens.

## References

- `mockup_v3/src/components/CommandPalette.tsx`
- `apps/desktop/src/stores/appStore.ts`
- `apps/desktop/src/workspace/openNote.ts`
