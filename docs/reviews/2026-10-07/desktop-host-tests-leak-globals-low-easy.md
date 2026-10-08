# `desktopExtensionHost.test.ts` mutates global singletons without guaranteed cleanup

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/desktopExtensionHost.test.ts`
- **Lines:** 289–353 (`setWorkspaceBridge` set/reset inline), 145–188, 455–494 (`useSettingsStore.setState`), 61–102 (singleton registries)

## Description

Several tests write to process-global state and clean up only at the end of
the happy path:

- `setWorkspaceBridge({...})` is paired with a trailing
  `setWorkspaceBridge(null)` at 309, 327, 353 — but an assertion failure
  mid-test skips it, leaking a fake bridge into later tests (there's no
  `afterEach` outside the workspace-settings describe).
- `useSettingsStore.setState(...)` (146, 455+) is never restored; later tests
  inherit whatever the last test staged.
- The first describe block calls `createDesktopExtensionHost()` with no
  injected registries, so activations write into the real
  `desktopCommandRegistry` / `desktopPanelRegistry` /
  `markdownEditorHookRegistry` singletons and rely on deactivate to clean up —
  again fine on the happy path, leaky on failure.

Vitest isolates per file, so blast radius is limited to this file's tests —
but a leaked bridge or registry entry makes unrelated failures cascade and
hard to diagnose.

## Recommendation

Add a top-level `afterEach` that calls `setWorkspaceBridge(null)` and resets
`useSettingsStore` state (the workspace-settings describe at 430–437 already
models this for hosts). Prefer injected registries (`createDesktopTabRegistry`
etc., as later tests do) over the default-singleton path where the assertion
doesn't need the app-wide instance.

## Verification

Read desktopExtensionHost.test.ts:289–353 (manual `setWorkspaceBridge(null)`
at test ends; no shared `afterEach` until line 434), 146–150 and 455–494
(`useSettingsStore.setState` with no restore), and 61–102 (default-injected
host writing to the app-wide registries — `desktopCommandRegistry.get` at
line 88 reads the singleton).
