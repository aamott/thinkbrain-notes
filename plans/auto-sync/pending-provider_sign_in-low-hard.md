# Provider Sign-In

Story 9. Replaces pasting a PAT with "Sign in with GitHub" for users who have
never generated a token. Provider authorization supplies the credential;
existing HTTPS Git sync consumes it. The manual username/token form stays —
GitLab, self-hosted, bare-repo-on-a-NAS, anyone who already has a token.

## Decisions

- **GitHub App device authorization flow** — suited to desktop/mobile,
  repository-scoped permissions, no embedded browser, callback server, or
  client secret. The user briefly leaves the app to authorize.
- **No backend or app private key** — the public `client_id` ships in the
  binary. Register the app under `aamott` ("ThinkBrain Notes") with Device
  Flow explicitly enabled; device grant needs no callback/redirect URL.
- **Minimum permissions** — `Contents: read/write` plus required metadata;
  let users grant only chosen repositories rather than OAuth's broad `repo`.
- **Expiring credentials** — leave expiration on; persist access + refresh
  tokens as one versioned secure bundle (rotation can't lose the refresh
  token between writes); refresh before git ops in the app's credential
  path (the gix callback supplies a static account). Revoked/expired →
  sign-in recovery action, never silent discard. If refresh proves
  incompatible with the git credential path, stop and reassess — do not
  fall back to long-lived credentials.
- **Reuse the existing profile/catalog and secure store**; the GitHub
  bundle is distinguishable from PAT secrets; existing profiles and the
  manual flow are preserved.
- **No provider framework** — GitHub only; a future provider gets its own
  auth normalized into the same credential path.
- **Rust-owned device-flow lifecycle** (start/poll/cancel): expose only
  user code, verification URL, expiry/interval, opaque flow ID — never
  `device_code` or token values to the renderer or logs. Reuse the flow
  from Settings and the Git-link/import dialog.
- **Sign-out is local** — deletes this device's credentials; v1 links to
  GitHub's app settings for remote revocation.

## Verification & out of scope

- Fake transport tests for pending, `slow_down`, denial, expiry,
  cancellation, rotation, network failures. Tokens absent from catalog,
  events, logs, settings; legacy PAT profiles still work.
- Smoke-test real Git fetch/pull/push on a disposable private repo on
  desktop and Android — GitHub API success alone does not prove the git
  credential path.
- Out of scope: SSH sign-in; GitLab/other provider sign-in (independent
  follow-ups); extension-scoped credentials
  (`extensions/extension_secret_storage`).

## Acceptance

- [ ] A GitHub user authorizes via system browser and syncs without making
      or copying a PAT
- [ ] Device/refresh tokens stay in secure storage, absent from
      catalog/events/logs/settings
- [ ] Expired tokens refresh safely, including rotated-refresh persistence;
      revoked/expired grants lead to a clear recovery action
- [ ] Sign-in works from Settings and the Git-link/import dialog; the
      manual token form works unchanged
- [ ] Sign-in and git-operation failures surface as recovery actions
      consistent with story 6's error taxonomy
