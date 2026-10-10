# Story: The App Can Update Itself

**Status:** 🟨 shipped in 0.1.0, unproven until 0.2.0 · **Urgency:** medium · **Difficulty:** medium

Tracks GitHub issues #24 and #25 — the updater has never reached anyone because every release so far is a prerelease.

## Why it shipped in the first release

Tauri's updater only accepts a bundle signed by a key whose public half is
compiled into the app, and finds updates via a compiled-in endpoint — neither
can be added later. And config alone updates nothing: something must call
`check()`.

## What it does

Checks once per window open. Offers the found version in a banner with
"Install and restart" and "Not now"; dismissing defers until next launch.

- **A failed check is silent** — the user did not ask and cannot act on it.
- **A failed install is reported and does not restart** — restarting into a
  half-written install is how a working app breaks.

## Shape

- `useAppUpdate.ts` — state machine over an injected check/relaunch; no Tauri
  imports, tests as ordinary React.
- `appUpdater.ts` — Tauri half; `null` where there is no updater (browser dev,
  mobile), treated as "nothing to do".
- `UpdateBanner.tsx` — modelled on `StaleDocumentBanner`: `role="status"`,
  never takes focus.
- Desktop only, gated in `Cargo.toml` and `lib.rs`; Android has no upstream
  updater and the store owns updates there.

## Operational notes

The private key lives only in repo secrets (`TAURI_SIGNING_PRIVATE_KEY`,
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) and its owner's backup. **Losing it means
no installed copy can ever be updated again**; rotating is a manual reinstall
for everyone. The endpoint is
`https://github.com/aamott/thinkbrain-notes/releases/latest/download/latest.json`,
which resolves the newest **published, non-draft** release — an update is
offered only once a release is published by hand.

## Acceptance criteria

- [x] The public key and endpoint are compiled into 0.1.0.
- [x] Something calls `check()` at launch.
- [x] A failed check is silent; a failed install is reported and does not restart.
- [x] The updater is absent from mobile builds by construction.
- [ ] **An update has actually been installed end to end** — untestable until a
      published release exists to update *from*; 0.2.0 is the first real proof.

## Known gaps

- **Restarting does not check for unsaved edits.** Banner says to save first;
  refusing install while a tab is dirty is the obvious follow-up.
- **Every window checks** — two windows make two requests/banners.
- **No manual "check for updates"** besides restarting.
