# Injectable host registries stop halfway — settings, events, and workspace stay global singletons

- **Urgency:** low
- **Difficulty:** med
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/desktopExtensionHost.ts`
- **Lines:** 261–267 (`DesktopExtensionHostRegistries`), 275–279, 296–327, 376

## Description

`createDesktopExtensionHost` accepts injected registries "so tests can isolate
a host from the app-wide singletons" — but only for commands, panels,
editorHooks, editorHeaders, and tabs. The remaining surfaces are hardwired to
module singletons:

- `appSettingsRegistry` / `useSettingsStore` (settings API, lines 298–326)
- `appEvents` (events API, line 376)
- `extensionWorkspace` (module-level, lines 275–279) built on
  `workspaceDocumentApi`, `workspaceDesktopApi`, and `getWorkspaceBridge`

So a test that builds an isolated host still mutates global settings state
(`useSettingsStore.setState(...)` appears throughout the tests), publishes on
the shared `appEvents` bus, and gets a `context.workspace` that calls the real
native adapters — unusable in a non-Tauri test beyond `rootPath()` returning
`null`. The injection point's stated purpose (isolation) is only half met, and
tests of two concurrently-created hosts share these singletons regardless of
the injected registries.

## Recommendation

Either widen the options object to accept the settings store/registry, event
bus, and a `DesktopExtensionWorkspace` factory, or narrow the docstring so it
doesn't promise isolation it doesn't deliver. The wider fix is preferable if
extension tests are expected to grow — a per-host `appSettingsRegistry` would
also remove the "hand the module back or the next activation collides"
ceremony noted at desktopExtensionHost.test.ts:430–437.

## Verification

Read desktopExtensionHost.ts:261–279 (injected list vs. module-level
`extensionWorkspace`) and 296–327, 376 (settings and events touch
`useSettingsStore`, `appSettingsRegistry`, `appEvents` directly).
desktopExtensionHost.test.ts:146–150, 455–472 mutate the real store; the
workspace test at 234–247 can only assert `typeof`/null.
