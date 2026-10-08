# Panel mount cleanup only accepts a function — a Disposable-returning extension throws at unmount

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/panels/extensionPanelMount.tsx`
- **Lines:** 49–52, 128–146

## Description

`ExtensionPanelMount` is typed `… => void | (() => void)` and the cleanup
runs `cleanup?.()`. The surrounding API is steeped in `Disposable`
(`onDidChange` returns one, every host `register` returns one), so the most
natural thing for a disk-loaded extension — plain JavaScript with no type
checker — is to return `{ dispose() { … } }` or an array of disposables.
At unmount, `cleanup?.()` then throws `cleanup is not a function`, which the
catch forwards to `onError` as a spurious "panel failed" report while the
extension's real teardown never runs (leaking timers/listeners the cleanup
was meant to stop).

## Recommendation

Normalize the return value instead of calling it blind:

```ts
const dispose =
  typeof cleanup === "function"
    ? cleanup
    : () => (cleanup as Disposable | undefined)?.dispose();
```

or widen the contract to `void | (() => void) | Disposable` and accept both
in the type. Either way keeps the reported error for genuine teardown
throwers.

## Verification

`extensionPanelMount.tsx:130` assigns `cleanup = mount(element, context)`
untyped-checked at runtime, and `141` invokes `cleanup?.()` — any non-callable
truthy return reaches the catch at `142`. The `Disposable` shape used
throughout (`onDidChange` at `124`, `desktopExtensionHost.ts` `own()`) is a
`{ dispose(): void }` object, not a function.
