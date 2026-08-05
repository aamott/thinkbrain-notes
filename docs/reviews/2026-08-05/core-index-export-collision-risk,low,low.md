- name: Cross-file export surface review for packages/core/src/index.ts
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/index.ts
- lines: 64-73
- description: `index.ts` now re-exports both `./contributions` (added by this
  branch) and `./settings/index` (which re-exports `./settings/registry`,
  including `getModuleIdFromKey`). The two contribution surfaces use distinct
  names (`createContributionRegistry`, `CommandContribution`,
  `PanelContribution`, `EditorHookContribution`, `ContributionRegistry`,
  `IdentifiedContribution`, `CommandHandler`, `PanelFactory`,
  `EditorExtensionFactory`, `EditorKeybindingFactory`) and the settings surface
  uses `SettingsRegistry`, `createSettingsRegistry`, `getModuleIdFromKey`, so
  there is no current name collision.

  However, the two registries model the same conceptual operation (ordered,
  duplicate-rejecting registration) with **different APIs**: the generic
  `ContributionRegistry` exposes `register`/`get`/`entries`, while
  `SettingsRegistry` exposes `register`/`registerMigration`/`getModule`/
  `getAllModules`/`getDefinition`/`getDefinitionsForSection`/`getModulesByScope`/
  `getAllDefinitions`. The settings registry does not implement or extend
  `ContributionRegistry<SettingsModule>`, even though `SettingsModule` satisfies
  `IdentifiedContribution` (it has a readonly `id: string`).

  This is an architectural observation, not a bug: the settings registry has
  richer, domain-specific lookup (section/scope/definition resolution) that the
  generic contribution registry does not model. But the plan's long-term goal is
  that "built-in features and extensions share one contribution model." When the
  extension API surface story lands, consider whether settings schema
  registration should flow through the unified `ContributionRegistry` surface
  (with the richer lookup layered on top) so extension manifests can declare
  settings contributions the same way they declare commands and panels. Filing
  now so the divergence is a deliberate decision rather than an accident of the
  first story.
- verification: Read `packages/core/src/index.ts` lines 64-73. Read
  `packages/core/src/contributions.ts` and `packages/core/src/settings/registry.ts`
  export surfaces. Confirmed `SettingsModule` structurally satisfies
  `IdentifiedContribution` but `SettingsRegistry` does not extend
  `ContributionRegistry<SettingsModule>`. Confirmed no current export-name
  collision via grep over both modules' exported identifiers.
