- name: Command `keybinding` is stored but never bound to a global shortcut handler
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/commands/commandRegistry.ts
- lines: 79, 90, 110
- description: |
    The acceptance criterion states the command registry allows registering commands
    with "id, title, handler, and optional keybinding." The `keybinding` field is
    present on `CommandContribution` (packages/core/src/contributions.ts:79) and set
    on `open-file` ("Ctrl/Cmd+P") and `search` ("Ctrl/Cmd+Shift+F"), but a repo-wide
    grep shows the field is only READ by `CommandPalette.tsx:81` for display
    (`command.keybinding ?? command.shortcut`). No global keybinding listener
    dispatches registered commands when their `keybinding` is pressed outside the
    palette.

    This means the "optional keybinding" is currently display-only metadata, not a
    functioning shortcut. For the migration story this may be acceptable (the palette
    is the only entry point today), but it should be explicitly noted so the next
    story in the extensions epic knows to wire a global keybinding layer that reads
    `desktopCommandRegistry.entries()` and matches `keybinding`. Without that, the
    `keybinding` field risks becoming a second `shortcut`-style legacy field.

    Recommended: either add a brief code comment on `CommandContribution.keybinding`
    in `packages/core` stating "display + future global binding; not yet bound
    globally," or open a follow-up task. At minimum, add a test asserting the
    keybinding field round-trips through the registry so the contract is locked.
- verification: |
    `grep -rn '\.keybinding\b\|keybinding:' apps/desktop/src` (excluding tests) returns
    only commandRegistry.ts (definitions) and CommandPalette.tsx:81 (display). No
    `addEventListener('keydown'...)` or accelerator dispatcher consumes the field.
