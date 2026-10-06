# Undo A Restore

Depends on: `pending-post_restore_navigation-high-med.md`
Depends on: `pending-render_restore_events-high-med.md`
Depends on: `pending-refuse_stale_restore-high-hard.md`

## Goal

Offer an immediate, explicit way to reverse a completed restore.

## Acceptance Criteria

- The success confirmation offers Undo while its checkpoint is still
  applicable.
- Undo restores from the checkpoint through the same mutation lock,
  fingerprint guard, recording, and reload path as an ordinary restore.
- A moved file refuses Undo and directs the user to Version history.
- The restored history entry remains available after the transient Undo action
  disappears.
- Repeated restore/Undo cycles do not lose versions or create duplicate
  no-change entries.
- Desktop and phone behavior is equivalent.

## Files

- `apps/desktop/src-tauri/src/commands/sync/history.rs`
- `apps/desktop/src/shell/StatusBar.tsx`
- `apps/desktop/src/shell/useShellState.ts`
