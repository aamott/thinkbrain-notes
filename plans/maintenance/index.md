# Maintenance Backlog Index

Focused follow-ups from the extensions/contributions/settings/editor/panels/commands
review pass. These are maintenance stories only; feature behavior remains owned by
its existing epic.

Maintenance is a deliberate exception to the top-level epic structure: this index
may hold narrow cross-cutting fixes that do not have one feature owner. It is not a
new maintenance epic or a catch-all. Feature behavior stays in its owning epic;
broad work must be re-homed to the appropriate top-level epic (or split across
its owners), and completed stories are retired rather than retained as active
backlog.

`pending-core_adapter_interfaces-low-hard.md` is the explicit cross-cutting
holding item here. Its ownership is the platform/core boundary, not mobile,
extensions, or any single feature epic; re-home it to a dedicated platform/refactor
epic (or split the implementation into the owning epics) if that structure is
created before implementation begins.

## Recommended order

1. `pending-settings_schema_safety-low-med.md` — core schema contracts and validation;
   prerequisite for safely accepting extension-contributed settings.
2. `pending-registry_lookup_safety-low-med.md` — remove registry non-null assertions
   and preserve lifecycle/disposal invariants.
3. `pending-desktop_panel_contexts-low-med.md` — separate left/right panel factory
   contexts before adding more extension panels.
4. `pending-narrow_shell_panel_ids-low-med.md` — restore narrow shell selection types
   while keeping registry IDs extensible.
5. `pending-settings_effective_value_source-low-med.md` — one effective-value source
   for the settings UI and store.
6. `done-settings_highlight_bus-low-med.md` — isolate subscriber failures and HMR
   state in the settings search bridge. (Implemented; pending review.)
7. `pending-desktop_shell_dirty_sync-trivial-low.md` — eliminate redundant dirty-state
   dispatches after the shell typing changes.

## Deferred holding item

- `pending-core_adapter_interfaces-low-hard.md` — quarantined, non-blocking, and not in
  execution order. Re-home or split only after a concrete feature proves a shared gap.

## Scope guard

Do not duplicate work in:

- `plans/extensions/` — extension lifecycle, manifests, API surface, settings schemas,
  secret storage, and built-in registrations.
- `plans/git-integration/` — Git/source-control behavior.
- `plans/ai/` and `plans/wip-ai-low-hard.md` — assistant behavior.
- journal/calendar plans — journal feature behavior.
- `plans/ui-shell/` — larger shell feature work; this index covers only narrow
  maintenance corrections.

## Unresolved latest-code findings only

The index intentionally excludes resolved findings, historical commit summaries, and confirmed observations that do not need a story. Current findings represented by the stories above:

- Core packages and the Tauri integration still lack platform-agnostic adapter interfaces
  (`FileSystemAdapter`, `SearchAdapter`, `AppPathsAdapter`, `GitAdapter`,
  `SettingsAdapter`).
- `SettingType` validation still has a silent future-type branch; `SettingDefinition.default`
  remains too broad, and empty/invalid enum schemas can pass registration.

- `Map.get(...)!` ordered lookup assertions remain in contribution/settings registries.
- `DesktopPanelContext` still forces `RightPopout` to fabricate left-side no-op state.
- Shell `LeftPanel`/`RightPanel` still widen to arbitrary strings, losing built-in ID
  compile-time safety.
- Settings highlight listeners can abort sibling notification; module-scoped state has
  no HMR disposal hook. — **resolved** by `done-settings_highlight_bus-low-med.md`
  (subscriber try/catch isolation + Vite HMR dispose).
- `SettingsContent` still duplicates effective-value precedence.
- `DesktopShell` still depends on the whole tab array for its settings dirty-sync
  effect, causing redundant dispatches.

If a finding is resolved in the latest code before implementation, remove or update its
story and this list rather than preserving historical context here.
