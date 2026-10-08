# Extension settings can name a custom `control` key that nothing can ever register

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/controlRegistry.ts`
- **Lines:** 9–12, 63–74, 117–130 (with `desktopExtensionHost.ts:86–97, 129–147`)

## Description

`controlRegistry`'s header documents the intended integration: "Definitions
may override the auto-generated control by setting a `control` key that maps
to a component registered here via `registerControl`. … Extensions register
custom controls at app startup." (`controlRegistry.ts:5–12`)

But `registerControl` is only reachable by importing the settings module
directly — `DesktopExtensionContext` (`desktopExtensionHost.ts:129–147`)
exposes commands/panels/editorHooks/editorHeaders/tabs/settings/events/
workspace, and `DesktopExtensionSettings` (`86–97`) is exactly
`registerSchema`/`get`/`set`/`onDidChange`. There is no
`context.settings.registerControl`, and the host-injected registries
(`DesktopExtensionHostRegistries`) do not include it either.

So an extension definition that sets `control: "my-widget"` hits
`getControlForDefinition`'s fallback branch (lines 120–129): a console
warning and the type-based control. The documented extension capability is
dead API — reachable only by a built-in (or a local extension that
deep-imports `../../settings/controlRegistry`, bypassing the host boundary
the rest of the API goes through).

## Recommendation

Either expose control registration through the extension boundary — e.g.
`context.settings.registerControl(key, component)` routed to
`registerControl` with `own(context, …)` lifecycle scoping, matching
`registerSchema` at `desktopExtensionHost.ts:295–299` — or narrow the doc
comment and `SettingDefinition.control` docs to say custom controls are a
first-party mechanism. If exposed, key namespacing deserves a decision:
builtin keys are unqualified (`"sync-git-link"`), so extension keys should
probably follow the `${extensionId}.${key}` convention already used for
settings module ids.

## Verification

`grep -n "registerControl" apps/desktop/src` — the only call sites are the
two builtin registrations at `controlRegistry.ts:138–139`; no reference in
`desktopExtensionHost.ts` or `DesktopExtensionContext`. An extension schema
with `control: "x"` logs the fallback warning at lines 124–127.
