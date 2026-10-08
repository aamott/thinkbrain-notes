# Settings UI never observes `appSettingsRegistry` — late extension schemas don't render

- **Urgency:** med
- **Difficulty:** med
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/SettingsNav.tsx`
- **Lines:** 206–214, 218–220, 300–301 (also `SettingsContent.tsx:312–325`, `SettingsHeaderBar.tsx:41`, `packages/core/src/settings/registry.ts:40–64`)

## Description

Every other contribution surface in the app is reactive: panels, commands,
tabs, editor headers, and new-note actions all go through
`ContributionRegistry.subscribe` + `useSyncExternalStore`, so an extension
that registers late (lazy activation, `addLocalExtension`) appears in the UI
immediately.

The settings registry is the exception. `SettingsRegistry` has **no
subscribe API at all**, and the three settings surfaces read it as plain
imperative calls during render:

- `SettingsNav` calls `appSettingsRegistry.getModulesByScope("app" | "workspace")` and
  `getAllDefinitions()` inline (lines 300–301, 218).
- `SettingsContent` builds `renderedSections` from
  `getModulesByScope` inline (lines 312–325) — and feeds those ids into a
  scroll-spy `IntersectionObserver` keyed on `sectionIdsKey`.
- `SettingsHeaderBar.buildBreadcrumbPath` iterates `getAllModules()` inline.

Nothing re-renders these components when `context.settings.registerSchema`
runs — the registry write touches no store, no event, no subscription. The
only reason lazy extension sections show up at all today is a sequencing
accident: `SettingsTab` fires `activateAll()` on mount and *also* fires
`loadSettings`, and the store update from `loadSettings` happens to
re-render the nav after activation has usually finished. A slow activation
(local extension loaded over `read_extension_file` + blob import) can win
the race the other way and simply not appear. And a local extension
**added or removed while Settings is open** never updates the tree or the
content until an unrelated settings-store write re-renders — a removed
extension's section also stays listed, pointing at disposed definitions.

## Recommendation

Give `SettingsRegistry` a `subscribe(listener)` + snapshot contract like
`ContributionRegistry` (invalidated `getAllModules`/`getModulesByScope`
snapshots), and wrap the three call sites in a
`useSyncExternalStore`-backed hook (e.g. `useSettingsModules(scope)`) so the
nav, content, and breadcrumbs follow schema registration live — matching
the `usePanelContributions` precedent in `panelRegistryModel.tsx`.

## Verification

`packages/core/src/settings/registry.ts:40–64` — the `SettingsRegistry`
interface declares no `subscribe`. `grep -n "getModulesByScope\|getAllModules\|getAllDefinitions" apps/desktop/src/settings` — every
consumer calls it inline during render with no subscription. Compare
`apps/desktop/src/panels/panelRegistryModel.tsx:451–463`, which documents
exactly this hazard ("Reading the registry once during render is not
enough") and solves it with `useSyncExternalStore`.
