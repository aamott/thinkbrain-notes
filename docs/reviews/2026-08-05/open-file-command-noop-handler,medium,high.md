- name: "open-file" command is an available no-op that strands the palette
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/commands/commandRegistry.ts
- lines: 86-94
- description: |
    The `open-file` command is registered as `available` with `handler: () => undefined`
    and `keybinding: "Ctrl/Cmd+P"`. When a user selects it from the command palette,
    `CommandPalette.execute` (CommandPalette.tsx:40-52) calls `onCommand(item.command)`
    but does NOT call `onClose()`. The shell's `handlePaletteCommand`
    (DesktopShell.tsx:308) invokes `command.handler(context)`, which for `open-file`
    is a no-op that never calls `context.closePalette`. Net effect: selecting
    "Open file" silently does nothing AND leaves the palette open with no feedback.

    This violates the project's fail-loudly rule (AGENTS.md: "log errors clearly and
    return typed results") and the acceptance criterion that commands carry a real
    `handler`. The other three feature-owned commands (`open-graph`,
    `open-source-control`, `open-extensions`) are correctly marked `unavailable` with
    `unavailableMessage`; `open-file` should follow the same pattern (mark it
    `unavailable` with a prerequisite message, or wire a real handler that opens a
    native file picker via the `native/` bridge).

    Related design fragility: the palette delegates closing to each command's handler
    rather than closing after `onCommand` returns. Any extension command that forgets
    to call `closePalette` will exhibit the same "palette stays open" UX. Consider
    having `CommandPalette.execute` call `onClose()` after `onCommand` for available
    commands, or document the contract explicitly.
- verification: |
    Read commandRegistry.ts:86-94 (handler is `() => undefined`), CommandPalette.tsx:40-52
    (no `onClose` after `onCommand`), DesktopShell.tsx:308-336 (`handlePaletteCommand`
    only invokes `command.handler(context)`; no fallback close). Confirmed via grep
    that no `open-file`/`openFile` handler exists in `shell/` or `native/`.
