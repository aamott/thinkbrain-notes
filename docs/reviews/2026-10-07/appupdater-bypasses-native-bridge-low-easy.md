# `appUpdater.ts` invokes Tauri plugins directly, bypassing the `native/` boundary

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/appUpdater.ts`
- **Lines:** 13–23

## Description

The app boundary rule (apps/desktop/AGENTS.md: "all IPC invocations must pass
through `apps/desktop/src/native/` bridge adapters") is broken here:
`checkForUpdate` dynamically imports `@tauri-apps/plugin-updater` and calls
`check()`; `relaunchApp` imports `@tauri-apps/plugin-process` and calls
`relaunch()` — both real IPC invocations made from `shell/`.

This is the only non-`native/` production file that *invokes* plugin commands.
Other direct `@tauri-apps` imports outside `native/` are either the `isTauri()`
predicate (harmless environment probe used in ~8 files) or `listen` from
`@tauri-apps/api/event` (`sync/syncEvents.ts`, `workspace/workspaceWatcher.ts`,
`workspace/gitLinkImport.ts`) — event subscription, not invocation, and
consistent with the documented "renderer receives Tauri events directly" ACP
pattern.

## Recommendation

Move the updater/process calls into `native/` (e.g. `native/updater.ts`
exporting `checkForUpdate`/`relaunchApp`), keeping the lazy `import()` so
mobile builds still skip the plugins. Optionally extend the rule's wording to
carve out `isTauri`/`listen` explicitly so the boundary is honest.

## Verification

`grep -rn "plugin-updater\|plugin-process\|invoke(" apps/desktop/src` — the
only non-native invocation sites are this file; everything else routes through
`invokeNativeCommand` in `native/commands.ts`.
