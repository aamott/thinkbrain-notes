# Provider Sign-In

Story 9. Replaces pasting a personal access token with a provider-driven
sign-in, for users who do not know how to make one. Sits on top of story 6c's
keychain adapter — the storage does not change, only how the token arrives.

## Why this story exists

Story 6 ships a username + access-token form. That is the right floor: it
works for any HTTPS git host, needs no provider relationship from us, and the
user already knows they are setting up git. It is not the right ceiling for
someone who has a GitHub account and has never generated a PAT. "Sign in with
GitHub" is the path those users expect; this story is that path.

## Decisions

- **OAuth App device authorization flow.** It suits desktop/mobile clients:
  the app hands the user to GitHub in the system browser, displays a one-time
  code, and polls for authorization. It needs no embedded browser, local
  callback server, or client secret. The user does briefly leave the app to
  authorize; the benefit is avoiding PAT creation and copying.
- **No backend.** The public OAuth App `client_id` ships in the binary. Device
  flow does not use a `client_secret`, relay, or proxy. Register an OAuth App
  and explicitly enable Device Flow; the configured callback URL is not used
  by this grant.
- **Request `repo` scope for now.** Git push/pull to private repositories
  needs repository access, but this OAuth scope is broad: it covers private
  repositories the user can access, not just the selected workspace. Make
  that scope clear in the consent/setup UI. Revisit a GitHub App if narrower
  repository permissions become a requirement.
- **Support expiring credentials.** Current GitHub OAuth Apps can issue
  expiring access tokens and rotating refresh tokens. Request
  `offline_access`, persist both values securely, and refresh before git
  operations when needed. Do not disable expiration just to avoid implementing
  refresh; if refresh proves incompatible with the git credential path, stop
  and reassess rather than silently falling back to long-lived credentials.
- **Reuse the existing profile/catalog and secure credential store.** Keep
  provider metadata (provider, host, username/profile ID) in the existing
  catalog, and keep access/refresh tokens together in the secure credential
  store. Preserve existing PAT profiles and the generic manual credential
  flow. Do not add a provider framework for GitHub alone.
- **GitHub first.** Other providers added when named; no provider abstraction
  pre-designed. A second provider is the trigger for extracting one, per the
  epic's "no provider abstraction" decision.
- **Form stays.** The manual username/token form remains for GitLab,
  self-hosted, bare-repo-on-a-NAS, and anyone who already has a token.

## Implementation outline

1. Add a Rust-owned device-flow lifecycle: start, poll/status, and cancel.
   Keep `device_code` and token responses out of renderer state; expose only
   the user code, verification URL, expiry/interval, and an opaque flow ID.
2. Poll on GitHub's returned interval. Handle `authorization_pending`,
   `slow_down`, denial, expiry, cancellation, network errors, and retry without
   logging or returning secret values. Open the verification URL in the system
   browser when supported and always offer a copyable URL/code.
3. On authorization, fetch the GitHub account identity, then save a provider
   profile through the existing profile upsert path. Store access and refresh
   tokens as one versioned secure credential value so a rotated refresh token
   cannot be lost between separate writes.
4. Before Git operations, refresh expiring GitHub credentials as needed and
   atomically replace the secure token bundle. The current gix credential
   callback supplies a static account with no refresh token, so refresh must
   happen in the app's credential/profile path before handing the access token
   to gix. If refresh is rejected or the grant is revoked, surface a sign-in
   recovery action; do not silently discard the profile.
5. Reuse the same sign-in flow from Settings and the Git-link/import dialog.
   Keep manual PAT entry available in both existing contexts.
6. Clarify that removing a profile removes credentials from this device;
   revoke the app grant separately in GitHub settings unless a supported,
   reliable in-app revocation path is added.

## Verification

- Test device-flow polling and refresh against an injectable/fake transport,
  including pending, `slow_down`, denial, expiry, cancellation, rotation, and
  network failures.
- Assert tokens never appear in the profile catalog, renderer events, logs, or
  settings serialization; verify legacy PAT profiles still load and work.
- Cover progress, browser handoff/copy, cancellation, and recovery in both
  sign-in entry points.
- Smoke-test authorization and actual Git fetch/pull/push against a disposable
  private repository on desktop and Android. GitHub API success alone does not
  prove the git credential integration works.

## Out of scope

- SSH sign-in. Tracked only as "later if demanded" in story 6.
- Extension-scoped credential storage. That is
  `extensions/extension_secret_storage`; this story
  consumes the sync adapter as it stands.

## Open questions

- OAuth App registration details (owner, name, homepage, callback metadata,
  avatar/description shown on the authorization screen).
- Confirm `repo` scope is acceptable for v1 given its access to all of the
  user's private repositories. A GitHub App could offer narrower access, with
  additional registration and token-lifecycle complexity.
- Decide whether the product needs an in-app remote revoke operation, or
  whether local removal plus instructions/link to GitHub's authorized-app
  settings is sufficient for v1.

## Acceptance

- [ ] A user with a GitHub account and no PAT can authorize via a system
      browser and sync without creating or copying a PAT
- [ ] Device and refresh tokens remain in the secure credential store and are
      absent from settings/catalog/events/logs
- [ ] Expired access tokens refresh safely, including persistence of rotated
      refresh tokens; revoked/expired grants lead to a clear recovery action
- [ ] Sign-in works from both Settings and the Git-link/import dialog
- [ ] The manual token form still works unchanged
- [ ] Sign-in and git-operation failures surface as recovery actions,
      consistent with story 6's error taxonomy

## Status

⬜ Pending. Device flow and OAuth App are the current direction; app
registration, final scope approval, and remote-revocation UX remain open.
