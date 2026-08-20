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

- **OAuth App, not GitHub App.** OAuth App tokens do not expire and do not
  refresh; GitHub App user tokens expire every 8h and require storing and
  using a refresh token on every sync. A background-syncing notes app wants
  "set up once, forget," not periodic re-prompts. The cost is the coarse
  `repo` scope (all private repos, not one) — acceptable for a local app the
  user runs on their own machine, same trust model as the `gh` CLI. Revisit
  if users raise the scope, a backend lands, or GitHub deprecates OAuth Apps.
- **Device flow.** GitHub's recommended flow for desktop apps; no embedded
  browser, no localhost server, no redirect URI. App shows a one-time code,
  user opens github.com/login/device, authorizes, app polls for the token.
- **No backend.** Device flow is client-only. The public `client_id` (from a
  one-time OAuth App registration) ships in the binary; no `client_secret`,
  no relay, no proxy.
- **`repo` scope.** Required for private-repo push/pull. Granted at request
  time, not pre-baked.
- **Same keychain path as story 6c.** The token reaches `credentials::store`
  through the same code as the manual form — no second storage pipeline, no
  settings/JSON/log exposure.
- **GitHub first.** Other providers added when named; no provider abstraction
  pre-designed. A second provider is the trigger for extracting one, per the
  epic's "no provider abstraction" decision.
- **Form stays.** The manual username/token form remains for GitLab,
  self-hosted, bare-repo-on-a-NAS, and anyone who already has a token.

## Out of scope

- SSH sign-in. Tracked only as "later if demanded" in story 6.
- Extension-scoped credential storage. That is
  `plans/extensions/pending-extension_secret_storage-med-hard.md`; this story
  consumes the sync adapter as it stands.

## Open questions

- OAuth App registration (owner, name, avatar, app description shown on the
  GitHub authorize screen).
- Token revocation UX — a "Sign out of GitHub" control, and what happens when
  a token is revoked from github.com between syncs.

## Acceptance

- [ ] A user with a GitHub account and no PAT can sign in and sync without
      leaving the app or learning what an access token is
- [ ] The token reaches the keychain through the same path as the manual form;
      no second storage code, no settings/JSON/log exposure
- [ ] The manual token form still works unchanged
- [ ] Sign-in failure surfaces as a recovery action, consistent with story 6's
      error taxonomy

## Status

⬜ Pending. Flow and app type decided; registration and revocation UX open.
