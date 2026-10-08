# `bootstrap.dispose` abandons remaining extensions when one entry fails to dispose

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/bootstrap.ts`
- **Lines:** 349–353 (`dispose`), 227–236 (`disposeEntry`)

## Description

`dispose` iterates `states.values()` awaiting `disposeEntry` per entry; the
first rejection propagates immediately, leaving every later extension
registered (its contributions, settings schemas, and activation subscriptions
all still live) and `states` uncleared. A single extension whose `deactivate`
hook or subscription cleanup throws therefore leaks the rest of the shutdown.

`removeLocalExtension` has the same shape for a single entry — acceptable,
since it's one extension — but the dispose loop should be best-effort across
all of them.

## Recommendation

Collect per-entry errors during the loop (each still awaited, in order) and
throw after all entries are disposed — mirroring `DisposableError` in
`packages/core/src/lifecycle.ts`, or simply `console.error` each failure and
resolve. Either way `states.clear()` and the snapshot rebuild should run
unconditionally (a `finally`).

## Verification

Read bootstrap.ts:349–353 — a plain `for ... await` with no error handling.
`disposeEntry` awaits `state.registration?.dispose()` (line 233), which routes
through the core host's `deactivate` and can reject with
`ExtensionDeactivationError` / `DisposableError` (lifecycle.ts:367–426).
