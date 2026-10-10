# Renderer shell/state architecture review

## Scope and method

Reviewed the renderer application architecture around `shell/`, `tabs/`, `panels/`, `events/`, `notifications/`, `workspace/`, and the renderer-facing `native/` boundary. I first mapped production/test file sizes and cross-feature imports, then traced workspace restoration/switching, tab/document state, command execution, panel/tab/editor registries, notifications, and native event subscriptions. This is an architecture judgment, not only a bug audit.

## Summary: top 5 recommendations

1. **Make one workspace-session owner above both chromes.** It should own root selection and loading, and instantiate the workspace-switching controller once; the explorer should consume the session rather than confirm state back to the shell.
2. **Replace the flat `ShellState` mega-bag with explicit domain facets.** Prefer memoized `tabs`, `workspace`, `panels`, `commands`, and `documents` view models over either the current unstable object or a wholesale move to Zustand.
3. **Extract shared shell composition from DesktopShell and PhoneShell.** In particular, build landing-tab actions and workspace switching once; keep only routing/layout differences in each chrome.
4. **Remove the module-global command-surface override.** Inject the active chrome's command target explicitly so commands are deterministic, instance-scoped, and testable.
5. **Finish the native boundary.** Tauri event listening and runtime detection should be adapters under `native/`, not imports spread through shell/workspace/sync/settings.

## Findings ranked by value

| # | Finding | Urgency | Difficulty | Payoff |
|---|---|---|---|---|
| 1 | One owner for workspace session and switching | high | hard | very high |
| 2 | Split the unstable `ShellState` mega-bag into domain facets | med | hard | high |
| 3 | Deduplicate cross-chrome application composition | med | med | high |
| 4 | Inject command surfaces; remove the global mutable slot | med | med | high |
| 5 | Enforce the renderer/native bridge for events and capability checks | med | med | high |
| 6 | Restore dependency direction between shell, workspace, panels, and tabs | med | med | medium-high |
| 7 | Split the largest production renderer files by responsibility | low | med | medium |
| 8 | Keep the existing contribution-registry primitive; do not invent one universal registry | low | low | medium |

## 1. One owner for workspace session and switching

**Current decision.** `useWorkspaceLifecycle` owns `restoredWorkspacePath`, but changing it does not load a workspace. It passes the path through `explorerProps.initialWorkspacePath`; `WorkspaceExplorer` then owns the async open/list sequence and calls `onWorkspaceOpened` back into the shell to set the same path, name, files, and indexes (`apps/desktop/src/shell/useWorkspaceLifecycle.ts:77-80`, `:176-197`; `apps/desktop/src/workspace/WorkspaceExplorer.tsx:89-106`, `:193-230`, `:290-299`). Meanwhile each chrome separately constructs `useWorkspaceSwitching` (`apps/desktop/src/shell/DesktopShell.tsx:99-110`; `apps/desktop/src/shell/phone/PhoneShell.tsx:161-168`).

**Cost.** Workspace identity has two authorities: shell state and explorer reducer/ref state. The callback handshake makes load ordering implicit, enables transient disagreement during a switch, and forces unrelated consumers (settings, indexes, tabs, extension bridge) to wait on explorer behavior. `onWorkspaceLaunched` is especially revealing: it is declared as an explorer prop but documented as being read by the shell, and `WorkspaceExplorer` does not destructure it (`apps/desktop/src/workspace/WorkspaceExplorer.tsx:42-46`, `:60-73`). Duplicate switching controllers also duplicate capability/list fetches, window-focus listeners, and dialog state whenever chrome changes.

**Change.** Introduce `useWorkspaceSession` at `ShellRoot`/`useShellState`. It should own `{phase, rootPath, snapshot, files}`, perform open/list/restore through an injected `WorkspaceDesktopApi`, update indexes/settings, and expose explicit `open`, `close`, and `launch` actions. Instantiate `useWorkspaceSwitching` once beside it and provide the controller above the chrome choice. Make `WorkspaceExplorer` a consumer of the loaded session plus explorer-local UI state (expansion, selection, CRUD transients), not the loader/authority.

**Effort/risk/payoff.** Hard (roughly 1–2 weeks including race tests). Migration risk is high around startup restore, multi-window persistence, and stale async work; preserve the current root-token cancellation tests. Payoff is very high: one state machine, one switching controller, simpler explorer props, and clearer workspace/tab/index lifecycle.

## 2. Split the unstable `ShellState` mega-bag into domain facets

**Current decision.** `useShellState` returns a new flat object with roughly 50 state values/actions on every render (`apps/desktop/src/shell/useShellState.ts:309-367`); its interface includes tabs, documents, panels, workspace, sync, palette, updates, and desktop-only resizing (`apps/desktop/src/shell/shellStateTypes.ts:27-116`). Phone code therefore carries the rule that callbacks/effects must never depend on `shell` itself (`apps/desktop/src/shell/phone/PhoneShell.tsx:93-106`). `explorerProps` is another nested prop bag assembled to keep a memoized explorer stable (`apps/desktop/src/shell/useShellState.ts:256-295`).

**Cost.** The type makes every chrome depend on the whole application surface, hides ownership boundaries, and makes adding one feature widen a central contract. The unstable identity is easy to misuse and explains defensive dependency comments. Desktop-only state in a supposedly chrome-neutral contract is a concrete leak. `explorerProps` also mixes component configuration with shell services, as finding 1 shows.

**Alternatives considered.** (A) Memoizing the whole return object is cheap but gives little benefit because common tab/document changes still invalidate it. (B) Moving all shell state to one global Zustand store would make imperative document APIs and per-window lifecycle more global, not clearer. (C) **Recommended:** return memoized domain facets such as `tabs`, `documents`, `workspace`, `panels`, `commands`, and `sync`, each with state plus commands; pass only required facets to chrome subtrees. If measured render pressure remains, expose selected facets through instance-scoped React contexts or vanilla Zustand stores created per shell root.

**Effort/risk/payoff.** Hard but incremental (about 1 week). Mechanical risk is medium; compile-time types help. Payoff is high in dependency clarity, test fixtures, and safer effects, even if raw render count changes little.

## 3. Deduplicate cross-chrome application composition

**Current decision.** DesktopShell and PhoneShell correctly differ in layout/navigation, but both build almost the same no-workspace landing actions and duplicate the known-workspace loop (`apps/desktop/src/shell/DesktopShell.tsx:111-140`; `apps/desktop/src/shell/phone/PhoneShell.tsx:230-257`). Both also mount the switching provider/dialogs (`apps/desktop/src/shell/DesktopShell.tsx:162-164`, `:317-323`; `apps/desktop/src/shell/phone/PhoneShell.tsx:402-403`, `:593-597`).

**Cost.** Labels, capability gates, missing-workspace filtering, ordering, and behavior can drift. The duplicated imports and logic contribute directly to PhoneShell's 599 lines and make chrome tests repeat application-policy cases.

**Change.** Add a chrome-neutral `useNewTabModel`/builder that accepts small navigation adapters (`createNote`, `browseFiles`, `search`) and the shared switching controller. Move `WorkspaceSwitchingContext.Provider` and `WorkspaceSwitchingDialogs` to `ShellRoot`, outside the desktop/phone branch. Keep icon choice in a shared action descriptor or map semantic icon IDs in each chrome if presentation must differ.

**Effort/risk/payoff.** Medium (2–4 days), low behavioral risk with the existing onboarding tests. High payoff because it removes proven duplication and creates the right seam for future tablet/web chrome.

## 4. Inject command surfaces; remove the global mutable slot

**Current decision.** `useShellCommands` builds desktop effects before the chrome is selected. PhoneShell repairs that by writing a module-level `commandSurface` in an effect; command execution spreads the current global value into its context (`apps/desktop/src/shell/useShellCommands.ts:28-55`, `:119-170`; `apps/desktop/src/shell/phone/PhoneShell.tsx:170-210`).

**Cost.** Correct command behavior depends on effect timing and a mutable singleton outside React ownership. It is not safe for two shell roots in one JS realm, complicates isolated tests/HMR, and briefly leaves phone commands with desktop behavior before the effect commits. The comment that one slot is sufficient encodes today's mounting assumption rather than enforcing it.

**Change.** Choose form factor before constructing the command executor, then pass an explicit `CommandSurface` adapter into `useShellCommands`; alternatively let `runCommand(command, surface)` receive the mounted surface. A root-owned context/ref is acceptable if stable command callbacks are required, but it must be scoped to the shell instance. Keep the command registry global; only execution targets need injection.

**Effort/risk/payoff.** Medium (2–3 days). Risk is medium because keyboard/palette/phone routes all execute commands. Payoff is high: deterministic behavior and much easier command tests.

## 5. Enforce the renderer/native bridge for events and capability checks

**Current decision.** Command invocation is mostly centralized, which is good, but Tauri imports escape `native/`: watcher, git import, and sync subscribe directly to `@tauri-apps/api/event` (`apps/desktop/src/workspace/workspaceWatcher.ts:1-4`, `:118-138`; `apps/desktop/src/workspace/gitLinkImport.ts:8-15`, `:58-64`; `apps/desktop/src/sync/syncEvents.ts:10-29`). `isTauri` is also imported by shell/workspace code (`apps/desktop/src/shell/useWorkspaceLifecycle.ts:1`, `:81-97`; `apps/desktop/src/workspace/workspaceAdapter.ts:1`, `:56-61`). This conflicts with the documented “all native communication through `native/`” boundary.

**Cost.** Tests must mock Tauri package modules throughout feature folders, event payload typing/cleanup conventions are repeated, and a future web/native transport change crosses unrelated features. Runtime detection also becomes policy embedded in consumers.

**Change.** Add typed `native/events` subscriptions and a `native/runtime` capability (`isNativeHost`) or, preferably, put fallback behavior inside injected adapters. Workspace watcher and sync modules should depend on those interfaces. Do not hide domain event translation: `workspaceWatcher` should still translate native changes to `appEvents`; only transport belongs in `native/`.

**Effort/risk/payoff.** Medium (3–5 days). Risk is medium around listener cleanup and Tauri event payloads. Payoff is high for compliance, tests, and Android/web portability.

## 6. Restore dependency direction between feature folders

**Current decision.** Shell imports workspace orchestration and workspace imports shell primitives (`apps/desktop/src/shell/DesktopShell.tsx:33-37`; `apps/desktop/src/workspace/WorkspaceSwitching.tsx:2`; `apps/desktop/src/workspace/WorkspaceExplorerView.tsx:6`). Panels import shell `Unavailable`, while shell imports panel models/renderers (`apps/desktop/src/panels/Popout.tsx:3-13`; `apps/desktop/src/shell/DesktopShell.tsx:13-16`). Shell types also derive selectable panel types from the panel registry (`apps/desktop/src/shell/shellTypes.ts:13-28`). Tabs are cleaner, but `MediaViewers` imports shell `Unavailable` (`apps/desktop/src/tabs/MediaViewers.tsx:5-7`).

**Cost.** These are mostly feature-folder cycles rather than proven runtime import cycles, but they erase layer direction: workspace cannot be reused without shell UI, and moving a primitive can unexpectedly affect registry/type initialization. The “circular-ish” shape is a symptom that `shell/` contains both application orchestration and generic UI primitives.

**Change.** Move `Menu`, `ModalDialog`, and `Unavailable` to a renderer UI/primitives layer. Move workspace/shell coordination into an `application/` or root composition layer. Let panel IDs/types be owned by `panels`, with shell consuming them, rather than re-exporting/re-deriving them bidirectionally.

**Effort/risk/payoff.** Medium (3–5 days), low runtime risk if done as import-only moves. Medium-high payoff in enforceable boundaries and future reuse.

## 7. Split the largest production renderer files by responsibility

**Current decision.** Several production files exceed the preferred 500-line guideline: `native/commands.ts` 765, `workspace/useWorkspaceTreeDrag.ts` 699, `shell/phone/PhoneShell.tsx` 599, `tabs/tabModel.ts` 586, `shell/TitleBar.tsx` 516, `workspace/WorkspaceExplorer.tsx` 511, and `panels/panelRegistryModel.tsx` 510. The worst files combine separable responsibilities: `tabModel` contains identities/factories/accessibility/history/reducer (`apps/desktop/src/tabs/tabModel.ts:4-112`, `:120-295`, `:308-586`), while the panel model combines contracts, built-ins, registry implementation, and React hooks (`apps/desktop/src/panels/panelRegistryModel.tsx:31-272`, `:272-509`).

**Cost.** Large review surfaces and frequent merge conflicts; architectural boundaries exist only as comments inside files. `native/commands.ts` is also a single type/import choke point for unrelated features.

**Change.** Split by stable concepts, not arbitrary line ranges: tab contracts/IDs, tab factories, reducer/history; panel contracts, built-ins, registry/hooks; native command map by domain with one typed invoker barrel; PhoneShell shared model hooks as in findings 1–3. Do not prioritize large test files merely for line count.

**Effort/risk/payoff.** Medium and incremental. Urgency is low because no file exceeds the hard 800-line limit and several are cohesive. Payoff is medium; perform alongside touched-feature work rather than as a standalone mass move.

## 8. Keep the existing contribution-registry primitive; do not invent one universal registry

**Current decision.** Contrary to the suspected duplication, command, panel, editor-header, editor-hook, and much of tab registration already delegate to `createContributionRegistry` or `createTabRegistry` (`apps/desktop/src/commands/commandRegistry.ts:183-190`; `apps/desktop/src/panels/panelRegistryModel.tsx:414-467`; `apps/desktop/src/tabs/editorHeaderRegistry.ts:41-57`; `apps/desktop/src/tabs/editorHookRegistry.ts:44-89`; `apps/desktop/src/tabs/tabRegistry.ts:124-195`). `editorCommands` is the exception: a mutable per-tab capability map with explicit invalidation/versioning (`apps/desktop/src/tabs/editorCommands.ts:48-95`, `:128-140`).

**Judgment.** **GOOD overall.** Contribution registries need ordered, disposable, extension-time registration; the shared primitive already supplies that. Editor commands are live runtime capabilities keyed by mounted tab, and the state cache is a bounded non-observable LRU-like cache (`apps/desktop/src/tabs/editorStateCache.ts:24-62`); forcing both into a contribution abstraction would blur semantics.

**Change.** Keep the shared contribution primitive. If a second live keyed runtime registry appears, extract a small `createKeyedExternalStore` with generation-safe unregister and `useSyncExternalStore` snapshots, then migrate `editorCommands`. Until then, only expose a factory/reset seam for tests; do not generalize speculatively.

**Effort/risk/payoff.** Low. The payoff is avoiding an unnecessary refactor while documenting the one intentional exception.

## Keep as-is

- **React state for per-window shell/session UI; Zustand for genuinely cross-tree services.** Tabs/panels are rooted in one shell, while notifications/settings/indexes have producers and consumers across features (`apps/desktop/src/shell/useShellState.ts:54-60`; `apps/desktop/src/notifications/notificationStore.ts:80-136`). Do not move everything into a global store.
- **Typed app event bus.** Plain fact payloads and activation-scoped subscriptions are an appropriate decoupling boundary (`apps/desktop/src/events/appEvents.ts:1-40`). Keep native transport separate from this domain bus.
- **Registry-backed extension surfaces.** Live subscription is necessary because extensions activate after render; the panel and editor-header hooks correctly use stable external-store snapshots (`apps/desktop/src/panels/panelRegistryModel.tsx:480-509`; `apps/desktop/src/tabs/editorHeaderRegistry.tsx:14-30`).
- **Error boundaries per tab/panel.** Failures are contained to extension/content surfaces rather than taking down the shell (`apps/desktop/src/panels/Popout.tsx:101-137`; `apps/desktop/src/shell/DesktopShell.tsx:261-265`).
- **A shared state layer with separate desktop and phone presentations.** `ShellRoot` chooses chrome by form factor while calling shared state once (`apps/desktop/src/shell/ShellRoot.tsx:21-35`). Keep this direction; tighten the shared application layer rather than recombining state and layout.
