# Provider Sign-In

Story 9. Replaces pasting a personal access token with a provider-driven
sign-in, for users who do not know how to make one. Sits on top of story 6c's
secure credential/profile path; provider-specific authorization supplies the
credential while existing HTTPS Git sync consumes it.

## Why this story exists

Story 6 ships a username + access-token form. That is the right floor: it
works for any HTTPS git host, needs no provider relationship from us, and the
user already knows they are setting up git. It is not the right ceiling for
someone who has a GitHub account and has never generated a PAT. "Sign in with
GitHub" is the path those users expect; this story is that path.

## Decisions

- **GitHub App with device authorization flow.** It suits desktop/mobile
  clients and permits repository-scoped permissions. The app hands the user
  to GitHub in the system browser, displays a one-time code, and polls for
  authorization. It needs no embedded browser, local callback server, or
  client secret. The user does briefly leave the app to authorize; the benefit
  is avoiding PAT creation and copying.
- **No backend or app private key.** The public GitHub App `client_id` ships in
  the binary. Device flow does not use a `client_secret`, private key, relay,
  or proxy. Register the app under the `aamott` account and explicitly enable
  Device Flow. A homepage can point to the project's GitHub page; the device
  grant does not use a callback/redirect URL.
- **Minimum repository permissions.** Request `Contents: read/write` for Git
  fetch/push and only the required metadata permission. Prefer letting users
  grant access only to repositories they choose, rather than an OAuth App's
  broad `repo` scope.
- **Support expiring credentials.** GitHub App user access tokens can expire
  and use rotating refresh tokens. Leave expiration enabled, persist both
  values securely, and refresh before git operations when needed. Do not
  disable expiration just to avoid implementing refresh; if refresh proves
  incompatible with the git credential path, stop and reassess rather than
  silently falling back to long-lived credentials.
- **Reuse the existing profile/catalog and secure credential store.** Keep
  the profile as the link between this GitHub authorization and the selected
  HTTPS host, and keep access/refresh tokens together in the secure credential
  store in a versioned GitHub App credential bundle, distinguishable from
  existing PAT secrets. Preserve existing profiles and the generic manual
  credential flow. Git-over-HTTPS credential delivery stays provider-neutral;
  GitHub's authorization and token lifecycle stay GitHub-specific.
- **Do not generalize for hypothetical providers.** GitHub App is only for
  GitHub. If GitLab or another provider is added later, implement its own
  authorization/scopes/token lifecycle and normalize its resulting credential
  into the existing secure profile + HTTPS Git path. Keep manual credentials
  as the fallback for hosts without a supported sign-in flow. Extract shared
  authorization machinery only when a second provider demonstrates real
  duplication; do not add a provider framework in this story.
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
6. Make local removal clear: it deletes credentials from this device. For v1,
   link users to GitHub's app authorization/installation settings for remote
   revocation instead of adding a separate remote-revoke API flow.

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
- GitLab or other provider-specific sign-in. Those can be added independently
  later; they do not require changing GitHub App auth or the generic HTTPS Git
  credential path.
- Extension-scoped credential storage. That is
  `extensions/extension_secret_storage`; this story
  consumes the sync adapter as it stands.

## Open questions

- Choose the final public app name and description. The owner is `aamott`; use
  the project repository URL as the homepage if it is public, otherwise the
  `aamott` GitHub profile. No project-owned server or callback endpoint is
  needed for device flow.

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

⬜ Pending. GitHub App device flow, `aamott` ownership, repository-scoped
permissions, expiring credentials, and local-only sign-out are the direction;
final app branding and an end-to-end private-repository smoke test remain.
