# Git Error Handling

## Goal

Ensure all Git operations fail loudly with useful, typed errors for the common
Git failure cases, so users get actionable messages instead of raw stderr.

## Acceptance Criteria

- [ ] Dedicated `NativeError` codes for: Git not installed, workspace not a
      repo, authentication failure, merge conflict, command timeout / non-zero
      exit.
- [ ] Git stderr/stdout is captured into `NativeError.details` for
      diagnosability.
- [ ] Frontend maps native errors to user-facing messages via
      `NativeCommandError` (existing shape in `commands.ts`).
- [ ] Source-control panel renders error states clearly (not just console
      logs).
- [ ] Unit tests cover each error code path (missing Git, non-repo, non-zero
      exit).
- [ ] No error is swallowed to make an action appear to succeed.

## Relevant Files

- `apps/desktop/src-tauri/src/lib.rs` — `NativeError` codes + Git command error
  mapping
- `apps/desktop/src/native/commands.ts` — `NativeCommandError` /
  `normalizeNativeError` (existing; extend if needed)
- `apps/desktop/src/git/gitService.ts` — error mapping helpers
- `apps/desktop/src/git/SourceControlPanel.tsx` — error rendering

## Notes

This is cross-cutting and should be applied as each Git command is implemented,
then consolidated/verified here. Not a single standalone PR so much as a
quality bar enforced across the epic.
