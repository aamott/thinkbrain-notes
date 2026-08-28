# Story: "When I Return" May Never Return, on a Desktop

**Status:** ⬜ pending · **Urgency:** med · **Difficulty:** med

> Found 2026-08-28 by the whole-branch review of `mobile-sync-triggers`. The
> `visibilitychange` assumption behind that branch was verified on an Android
> device and never on a desktop, because on Android it is the only signal that
> exists. On a desktop it is the wrong one.

## What happens

`sync.trigger` offers `foreground` to every user on every platform, and its
description promises the app "syncs whenever you open a folder, again when you
come back to the app if it has been more than a few minutes, and sends your
changes when you leave."

`syncTriggerAdapter.ts` implements "come back to the app" as
`document.visibilitychange`. On a phone that is exactly right — the OS hides
the webview when the app leaves the foreground. On a desktop it fires when the
**window is minimised or the OS hides it**, not when it loses or gains focus.

So a desktop user who selects `foreground` and works the ordinary way — several
windows, alt-tabbing between them, never minimising anything — gets:

- no sync on returning to the app, because they never left in the
  `visibilitychange` sense
- no sync on leaving it, for the same reason
- no sync from the sweeper, because Task 5 gated the idle timer on `Idle`

Their notes sync when they open a folder, and then not again until they press
Sync now. The settings copy tells them otherwise.

This is not the default — desktop defaults to `auto`, which resolves to `idle`
and is unaffected. It is a trap for someone who reads the four options and
picks the one that sounds like what they want.

## The repo already knows the right event

`apps/desktop/src/shell/useWorkspaceLifecycle.ts:148` listens for
`window "focus"` for exactly this "the user came back" purpose. The precedent
exists; the sync adapter simply did not use it, because it was written against
a device where `visibilitychange` is the only thing that fires.

## Shape of a fix, not yet decided

- **Listen for both**, and let the Rust side deduplicate. `sync_app_foregrounded`
  is already idempotent in the way that matters: it consults staleness, so a
  second call within the threshold does nothing. This is the smallest change
  and the adapter stays policy-free.
  The care needed: `focus` and `visibilitychange` both fire on some platforms
  for one user action, so the staleness gate is doing real work, not just
  guarding an edge case. And `blur` is a much weaker signal than `hidden` —
  flushing and pushing on every alt-tab is not what anyone wants.
- **Listen for `focus`/`blur` on desktop and `visibilitychange` on mobile.**
  Honest about the platforms differing, but it puts a platform branch in the
  frontend, which the design worked hard to confine to one line of Rust.
- **Say what it does instead.** Reword the option so it promises what
  `visibilitychange` actually delivers. Cheapest, and the worst answer: the
  option exists because returning to the app is a good moment to sync.

## Acceptance

- [ ] On a desktop, selecting `foreground` and returning to the app after the
      staleness threshold starts a sync — verified by watching, not by reading
- [ ] Alt-tabbing rapidly between windows does not start a sync per switch
- [ ] Android behaviour is unchanged, re-verified on a device
- [ ] Whatever the answer, the setting's description matches it exactly. The
      current copy was written for the mobile behaviour and shipped to both
- [ ] `pnpm qa` green
