# Git Remote Sync

Story 6. The one active sync. Depends on stories 1, 3; UI in 4, 5.

**Split, because "push/pull via gix" turned out to be half true.** gitoxide
fetches and cannot push, so sending was written rather than called:

- **6a — send pack.** `pending-send_pack-high-hard.md`. 🟩 Done.
- **6b — the round trip.** Fetch, three-way merge against an exact base,
  "Sync now", triggers, status. Unblocked.
- **6c — setup and credentials.** Gated: `extensions/pending-extension_secret_storage-med-hard.md`
  forbids choosing a keychain crate until its questions are answered. Until
  then a token has nowhere to live that is not a plaintext file.

## Scope

- ~~**Push/pull via gix + rustls**~~ — pull via gix, push via story 6a, both
  over gix's transport. Pull conflicts have an exact base → three-way merge
  (story 3) → merge UI.
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
