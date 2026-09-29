# Restore Workflow

## Goal

Make restoring a version feel like a completed document action rather than a
comparison tab that turns into a dead end.

## Scope

Give restore tabs a distinct identity, return users to the restored file after
success, record restores synchronously with typed provenance, refuse stale
previews, and expose checkpoint-backed Undo as a separate follow-up.

Direct Restore from Version history keeps the inspector open. Restore from a
preview tab closes that tab only after success. Failures leave the preview and
its context intact.

Out of scope: editable restore results, selective hunks, and the full-screen
editor redesign; those belong to `selective_restore_editor`.

## Architecture Decisions

- Tab title: `Restore: <filename>`.
- Breadcrumb: `Workspace › Restore › <path>`. The selected version's date is
  included in tooltip and accessible naming when available.
- A successful preview restore closes the restore tab, activates or opens the
  file tab, reloads its contents, and emits a transient confirmation.
- A restore is synchronously recorded on the main history branch after the
  pre-write checkpoint and write succeed.
- Restore records carry typed source id and source timestamp; UI never infers
  restore semantics by parsing an English message.
- Restore accepts an expected-current fingerprint and refuses when the file has
  moved since preview.

## Status

- ⬜ pending — give restore tabs and breadcrumbs an operation-specific identity
- ⬜ pending — close and redirect after successful preview restore
- ⬜ pending — record restore provenance synchronously
- ⬜ pending — render restored history entries distinctly
- ⬜ pending — refuse stale restore previews
- ⬜ pending — offer checkpoint-backed Undo
