# Live Presence Indicators

## Goal

Show who is online in the current collaboration session and where each
collaborator's cursor/selection is within the active note.

## Acceptance Criteria

- [ ] Online collaborators are listed (name/identifier, active file).
- [ ] Remote cursors and selections are rendered in the CodeMirror editor.
- [ ] Presence state is ephemeral — never written to the vault, SQLite cache,
      or persistent app settings.
- [ ] Presence updates are throttled to avoid flooding the transport.
- [ ] Presence UI is hidden when no collaboration session is active.

## References

- `apps/desktop/src/editor/` — CodeMirror 6 editor
- `packages/ui/src/components/` — presence list component (new)
- `plans/wip-collaboration-low-hard.md` — Presence as ephemeral state
