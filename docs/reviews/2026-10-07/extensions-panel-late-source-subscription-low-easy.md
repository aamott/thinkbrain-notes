# useSubscribedSlice never observes a source published after mount

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/ExtensionsPanel.tsx`
- **Lines:** 14–36

## Description

The doc comment says the hook "subscribes to a lazily-available source
(absent until bootstrap wires it)", but the subscribe callback resolves the
source exactly once, at subscription time:

```ts
(listener) => getSource()?.subscribe(listener) ?? noop
```

If `getSource()` returns `null`/`undefined` when React subscribes, the
listener is attached to nothing and `useSyncExternalStore` has no reason to
re-render — so a `setExtensionBootstrap(bootstrap)` or
`setLocalExtensions(controller)` that lands *after* the panel mounts is
invisible until some unrelated re-render happens to re-run the (new-identity)
subscribe function. Symmetrically, `setExtensionBootstrap(null)` on
`bootstrap.dispose()` leaves the panel showing stale entries.

Today `main.tsx` publishes both refs synchronously before `createRoot`
renders, so this is latent rather than user-visible — but the hook's stated
contract is exactly the case it misses, and the refs are explicitly
"published" globals. A secondary issue: the subscribe function is recreated
every render, so React unsubscribes/resubscribes on every render (harmless
but needless churn).

## Recommendation

Make the refs themselves notifiable — have `setExtensionBootstrap` /
`setLocalExtensions` invoke a small listener set (in `bootstrapRef.ts` /
`localExtensionsRef.ts`) and subscribe `useSubscribedSlice` to that,
re-checking `getSource()` inside. Alternatively memoize the subscribe
function and document that the sources must be published before mount.

## Verification

`bootstrapRef.ts:88–90` and `localExtensionsRef.ts:14–16` show the setters
notify nobody. `useSyncExternalStore` only re-subscribes when the subscribe
function changes *and* a render occurs; with `noop` attached and no
notification, the snapshot stays `EMPTY`/`NO_FAILURES` forever.
