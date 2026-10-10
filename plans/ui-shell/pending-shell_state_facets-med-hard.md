# Story: Split ShellState into domain facets; dedupe chrome composition

`docs/reviews/2026-10-10/architecture-shell-state-med-hard.md` #2-#4.

`useShellState` returns a new ~50-field flat object every render; phone code
carries the rule "never depend on `shell` itself". `DesktopShell` and
`PhoneShell` duplicate landing-tab actions, the known-workspaces loop, and
the switching provider mount. Command execution routes through a
module-global `commandSurface` slot PhoneShell repairs in an effect.

## Acceptance

- [ ] Memoized domain facets (`tabs`, `workspace`, `panels`, `commands`,
      `documents`) replace the flat bag; chrome subtrees take only what
      they use.
- [ ] Shared `useNewTabModel`/landing-action builder + switching provider
      hoisted to `ShellRoot`; chromes keep layout/navigation only.
- [ ] Command surface injected explicitly into `useShellCommands` (or
      `runCommand(command, surface)`); the module-global slot is gone.
