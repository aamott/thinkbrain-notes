# Story: The App Can Update Itself

**Status:** 🟨 shipped in 0.1.0, unproven until 0.2.0 · **Urgency:** medium · **Difficulty:** medium

## Why it had to be in the first release

Tauri's updater only accepts a bundle signed by a key whose **public half was
compiled into the installed app**, and it only knows where to look because the
endpoint is compiled in too. Neither can be added from the outside afterwards.
An installed 0.1.0 without them could never be updated by any later release —
not a thing to defer, and the reason this landed before the first tag rather
than after it.

The second half is easy to miss: config alone updates nothing. Something has to
call `check()`. A build with the key and the endpoint but no caller is still a
build that never updates.

## What it does

Checks once, when a window opens. Offers the version it found in a banner above
the workspace, with "Install and restart" and "Not now"; dismissing stops the
asking until the next launch.

- **A failed check says nothing.** The user did not ask, cannot act on it, and a
  notice on every offline launch is how the one that matters gets ignored.
- **A failed install says so, and does not restart.** They pressed a button, so
  they get an answer; and restarting into a half-written install is how a
  working app becomes one that will not open.

## Shape

- `useAppUpdate.ts` — the whole state machine, over an injected check and an
  injected relaunch. Imports no Tauri, so it tests as ordinary React.
- `appUpdater.ts` — the Tauri half. `null` where there is no updater to talk to
  (a browser dev run, a mobile build), which the hook treats as "nothing to do"
  rather than an error.
- `UpdateBanner.tsx` — modelled on `StaleDocumentBanner`: `role="status"`, never
  takes or traps focus, since the user did not ask and may be mid-sentence.
- Desktop only, gated in both `Cargo.toml` and `lib.rs`. Android has no updater
  implementation upstream, and that store owns updates there anyway.

## Operational notes

The private key lives only in the repository secrets
(`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) and wherever
its owner backed it up. **Losing it means no installed copy can ever be updated
again**, because the public half is already compiled into everything shipped.
Rotating it is a manual reinstall for everyone.

The endpoint is
`https://github.com/aamott/thinkbrain-notes/releases/latest/download/latest.json`,
which resolves to the newest **published, non-draft** release. Releases are held
as drafts until someone looks at them, so an update is offered only once it is
published by hand.

## Acceptance criteria

- [x] The public key and endpoint are compiled into 0.1.0, so any later release
      can reach it.
- [x] Something actually calls `check()` at launch.
- [x] A failed check is silent; a failed install is reported and does not
      restart.
- [x] The updater is absent from mobile builds by construction, not by luck.
- [ ] **An update has actually been installed end to end.** Untestable until a
      published release exists to update *from* — 0.2.0 is the first real proof,
      and until then this is wired but unexercised.

## Known gaps

- **Restarting does not check for unsaved edits.** The banner says to save first,
  which is honest but weaker than the guard `DirtyCloseDialog` gives a closing
  tab. Refusing to install while a tab is dirty, or offering to save, is the
  obvious follow-up.
- **Every window checks.** Two workspace windows open at launch make two
  requests and can show two banners. Harmless at this size; a shared check would
  be tidier.
- **No manual "check for updates".** If the once-per-launch check is missed
  there is no way to ask again short of restarting.
