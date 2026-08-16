# Git Remote Sync

Story 6. The one active sync. Depends on stories 1, 3; UI in 4, 5.

## Scope

- **Push/pull via gix + rustls** against the hidden repo's remote. Pull
  conflicts have an exact base → three-way merge (story 3) → merge UI.
- **Credentials:** gix credential callbacks → direct native OS
  keychain/keystore adapter. Coordinates with
  `extensions/pending-extension_secret_storage-med-hard.md` but does not wait
  for it; adapter migrates when that lands.
- **Zero git plumbing exposed:** no git CLI, no `.gitconfig`, nothing in the
  vault. Remote URL + prefs live in workspace settings (app-data); token in
  keychain only. First connect bootstraps automatically: fetch → merge (empty
  and nonempty remote both handled) → push. Checkpoint ref never pushed
  (story 1).
- **Setup, plain language:** "Sync your notes to another device" → paste
  link → sign in. No remote/URL/clone jargon. HTTPS + token first; SSH later
  if demanded.
- **Triggers:** on-idle (debounced ~30s default) + manual "Sync now" +
  frequency cap (1/min default), advanced settings. "Sync now" = save open
  editors → commit → fetch → merge → push; cancellable; waits for workspace
  mutex.
- **Errors:** offline/auth/rejected-push surface as recovery actions
  ("Reconnect", "Sign in again"); retry with backoff for transient.

## Acceptance

- [ ] Two-device round-trip incl. conflicting edits → merge UI → converged
- [ ] Token stored only in OS keychain; never in JSON/settings/logs
- [ ] Setup flow copy audit (no jargon); works against GitHub + GitLab
- [ ] Offline queue: edits while offline sync cleanly on reconnect

## Status

⬜ Pending.
