# Story: Git Works on a Phone — Cloning, and Where the Token Lives

**Status:** ⬜ pending · **Urgency:** high · **Difficulty:** hard

> Cloning is the most likely way a vault ever arrives on a phone, because it is
> the one way that needs no folder picker — see
> `pending-android_workspace_access-high-hard.md`. That makes this story part of
> onboarding rather than an advanced feature.

## What is already true

- **gix cross-compiles** for `aarch64-linux-android` and `aarch64-apple-ios`,
  gated on every sync-layer change. That was the bet auto-sync made and it
  holds.
- **The gate is narrower than its name.** CI and `scripts/sync-cross-android.sh`
  run `cargo check -p gix` — one package, no link step, no Tauri build. CI's
  own comment says so plainly. gix has never been **run** on a device: not a
  clone, not a fetch, not a merge.
- **The desktop clone flow exists** and is well covered —
  `auto-sync/done-workspace_from_git_link-med-hard.md` already does
  bootstrap-plus-first-trip off the UI thread, with a `sync://import` event and
  an opaque request id. Mobile should be able to reuse it rather than grow a
  second one.

## The blocker: credentials

On Android `commands/sync/credentials.rs` compiles to its `unsupported!` stubs,
which return `sync.auth_required` — *"Sign-in is not available on this device
yet."* That is honest and it does not crash, but it means:

- a **public** repository can be cloned,
- a **private** one cannot, and most people's notes are private.

`keyring` has no Android backend, and it is gated out of the build entirely
(`Cargo.toml:39`). So the question is not "make keyring work" but "what holds a
token on this platform".

This is the same unmade decision `plans/pending-extensions-low-hard.md` records
for extension secrets — *"native secret storage: an encrypted app-data fallback
remains an explicit unmade security decision"*. Mobile is what forces it, and
whatever is chosen should serve both.

Candidates, none chosen:

- **Android Keystore**, through a small Kotlin plugin. The platform's own
  answer, hardware-backed on most devices. Costs a native plugin and a JNI
  surface this project does not have yet.
- **Encrypted file in app-data**, with the key from Keystore. Less native code,
  and the same shape could serve desktop Linux where the secret service is
  often absent.
- **No stored token.** Clone public repositories only, and say so. Cheapest and
  least useful; worth naming so it is rejected deliberately rather than by
  default.

## The other constraint: no background sync

`auto-sync/done-mobile_cross_compile-med-easy.md` says a foreground-only
constraint was "documented for the mobile epic". It was not, so it is recorded
here and in the epic.

Android does not let an app run the idle-triggered round trip the desktop
sync assumes. Mobile needs its own answer to *when* a sync happens — on
foreground, on explicit pull-to-sync, on close — and the triggers in
`auto-sync/done-sync_trigger_debounce-low-med.md` were designed without this in
mind.

## Acceptance (to be settled)

- [ ] gix does a real clone on a real device — the first thing to try, because
      everything here assumes it and nothing has proven it
- [ ] A private repository can be cloned, or the app says clearly why it cannot
- [ ] Where the token lives is decided, written down with its reasoning, and
      serves the extensions epic's secret storage too
- [ ] Mobile sync triggers are defined and do not silently rely on background
      execution Android will not grant
- [ ] The desktop import flow is reused rather than duplicated

## First step

Before any of the above: clone a small public repository on a device. It is
cheap, it needs no decisions, and it either confirms the cross-compile bet in
practice or turns this whole story into something else.
