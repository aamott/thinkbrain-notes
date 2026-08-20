# Git Remote Sync

Story 6. The one active sync. Depends on stories 1, 3; UI in 4, 5.

**Split, because "push/pull via gix" turned out to be half true.** gitoxide
fetches and cannot push, so sending was written rather than called:

- **6a — send pack.** `pending-send_pack-high-hard.md`. 🟩 Done.
- **6b — the round trip.** Fetch, three-way merge against an exact base,
  "Sync now", triggers, status. 🟩 Done.
- **6c — setup and credentials.** Direct native OS keychain adapter via gix
  credential callbacks. Git link and sign-in are separate inputs; the token
  goes directly to the keychain and is rejected in the link field. Remaining:
  prove against GitHub + GitLab.

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
- **Setup, plain language:** workspace setting is **Git link** — an https://
  GitHub / GitLab link, or a folder path to a bare repo. HTTPS sign-in takes
  username and access token in dedicated keychain-only inputs; SSH later if
  demanded.
- **Triggers:** on-idle (debounced ~30s default) + manual "Sync now" +
  frequency cap (1/min default). Defaults are hardcoded; advanced settings
  later. "Sync now" = save open editors → commit → fetch → merge → push;
  waits for workspace mutex.
- **Errors:** offline/auth/rejected-push surface as a notification, bell
  entry, footer state, and recovery action. Every attempted automatic round
  counts against the one-minute cap, including failures, so a bad link cannot
  flash the footer in a loop.

## Acceptance

- [x] Two-device round-trip incl. conflicting edits → merge UI → converged —
      two vaults on one destination, including a note both sides changed.
      GitHub / GitLab as *hosts* is leftover 6c proof, not this criterion.
- [x] Token stored only in OS keychain; never in JSON/settings/logs
- [x] Setup copy names a folder or an https git link, not a vague "place"
- [x] Offline queue: edits while unreachable stay in the hidden history and
      go out on the next successful trip (idle or "bring in step now"). There
      is no separate queue file.

## Status

🟨 6a send-pack, 6b round trip, and 6c adapter + sign-in control done.
Remaining: GitHub + GitLab as hosts.
