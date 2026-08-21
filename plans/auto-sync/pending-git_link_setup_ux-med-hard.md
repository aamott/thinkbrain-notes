# Git-link setup UX

Story 6d. Depends on 6c (keychain adapter + sign-in fields). Does **not**
include Add Workspace / import-from-link (next phase).

## Decisions

- **Opaque profile IDs.** A saved sign-in is a labeled profile with a stable
  opaque ID. The keychain account is `profile:{id}` under the existing
  ThinkBrain Notes service. Lookup never keys solely by host + username, so
  two tokens for the same account stay distinct.
- **Metadata vs secret.** App-data may persist `{id, label, host, username}`.
  The token stays in the OS keychain only. Labels default to `username@host`
  and add ` (2)`, ` (3)`, … when that label is already taken.
- **Explicit selection.** Each workspace stores the selected profile ID in
  `sync.signInProfile` (workspace settings, not shown as its own row). Save
  link binds that ID; it does not invent or overwrite another profile.
  Profiles are never shared or overwritten automatically.
- **Host-bound profiles.** A profile can serve many repositories on its host,
  but cannot be moved to or offered to another host. Updating a GitHub profile
  never turns it into a GitLab profile behind another workspace's back.
- **Forget sign-in.** Deletes that profile's secret and metadata. Other
  workspaces that still point at the forgotten ID show a missing sign-in;
  nothing silently picks a replacement.
- **Legacy URL entries.** Older builds stored `(username, token)` under the
  repository URL. Those entries are still read when no profile ID is
  selected. Save link can copy one into a new profile. The URL entry is not
  deleted until that copy is known to be readable. Tokens are never logged.
- **Storage probe.** `get` of a never-written probe account: `NoEntry` means
  the backend is reachable. Do not write disposable secrets. Do not probe in
  a loop that would re-prompt the OS.
- **Buttons.** `Save link` persists destination + selected profile ID and
  returns. `Update sign-in` writes the selected profile's secret, or creates
  a new profile when New sign-in is chosen. Both schedule the existing round
  trip in the background when the link is HTTPS and a secret is available.
- **Nonblocking check.** Settings stay usable. Phase copy stays in the
  footer. Success uses the existing setup toast; failure uses the existing
  problem toast. A failed or offline check keeps the saved link and profile
  selection.

## Acceptance

- [x] Status distinguishes: backend available / no profiles; selected
      profile saved; selected profile missing; backend unavailable/locked
- [x] Multiple labeled profiles for the same host + username, selected by ID
- [x] Profiles are reusable across repositories but never across hosts
- [x] Save link reuses an explicit profile without re-entering a token
- [x] Update sign-in writes only the selected (or newly created) profile
- [x] Forget sign-in removes that secret; other workspaces are left missing
- [x] First verification is background; Settings stays usable
- [x] Live GitHub proof (shared with 6c; `scripts/sync-live-github.sh`)
- [ ] Live GitLab proof (still 6c leftover; not claimed here)

## Known limitations

- Importing a workspace from a git link is story 6e
  (`pending-workspace_from_git_link-med-hard.md`).
- Legacy URL entries are copied into a profile on Save link, not deleted.
- Two workspaces can still point at the same profile ID on purpose; Forget
  then makes both missing, which is the explicit-selection rule.
- Unsupported OS builds keep the existing "not available on this device"
  sign-in error; they do not grow a fake in-app token store.

## Status

🟨 Implemented in app code. GitHub live proof done. Remaining: GitLab live
proof (same leftover as story 6c).
