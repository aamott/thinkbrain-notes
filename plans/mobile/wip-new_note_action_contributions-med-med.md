# Mobile New note action contributions

## Goal

Let built-in extensions add focused actions to the mobile New note popup without hard-coding Journal into phone chrome or exposing an unapproved general-purpose extension menu API.

Depends on: `wip-files_first_navigation-high-hard.md`

## Acceptance criteria

- The app owns a live internal registry of mobile New note actions that point to canonical commands rather than duplicating command handlers.
- Built-in extension metadata can register actions before lazy activation; actions survive successful activation, disappear on failure/disposal, and local extensions gain no new manifest API.
- Journal contributes one **Today's journal** action backed by its existing `journal-calendar.today` command.
- The Journal action is visible before Journal activates, disabled without an open workspace, and activates/runs the canonical command when selected.
- Core Create new note and previous-note switching behavior remains unchanged.
- Added rows preserve popup anchoring, touch sizing, dismissal, and keyboard navigation.
- Focused registry/bootstrap/menu/shell tests and `pnpm qa` pass.

## File references

- `apps/desktop/src/commands/mobileNewNoteActionRegistry.ts`
- `apps/desktop/src/extensions/bootstrap.ts`
- `apps/desktop/src/extensions/builtins/journal.tsx`
- `apps/desktop/src/shell/phone/NewNoteMenu.tsx`
- `apps/desktop/src/shell/phone/PhoneHub.tsx`
- `apps/desktop/src/shell/phone/PhoneShell.tsx`
