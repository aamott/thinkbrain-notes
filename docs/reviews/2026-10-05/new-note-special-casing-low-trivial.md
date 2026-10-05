# `new-note` commandId is special-cased twice

- **Difficulty:** trivial
- **Urgency:** low
- **File:** `apps/desktop/src/shell/phone/PhoneShell.tsx` (`runCommand` ~154, `NewNoteMenu.onSelectAction` ~399-405)

## Description

`runCommand("new-note")` toggles the popup instead of running the command,
and `NewNoteMenu`'s contributed-action path re-checks `commandId ===
"new-note"` to call `createNewNote` instead. The meaning of the id lives in
two places; a third caller (e.g. a future keyboard shortcut or bubble) must
relearn the rule.

## Recommendation

Keep the id→behaviour mapping in one place: either `runCommand` learns
"create vs toggle" from call-site intent (a `intent` parameter), or the menu
exposes a resolved `onRunCommand(commandId)` so the caller never sees the
special case.

## Verification

Architecture review + test suite: the contributed-row alias is covered by a
dedicated test, so any refactor of the special-casing has a safety net.
