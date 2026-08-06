# Registry Lookup Type Safety

## Goal

Remove non-null assertions from ordered registry lookup paths while preserving
registration order, disposable removal, and fail-loud behavior. This is a small
maintainability hardening task for the generic contribution registry and the settings
registry; it is not a registry unification project.

## Files

- `packages/core/src/contributions.ts` — replace `order.map((id) =>
  contributions.get(id)!)` with a checked lookup or a structurally safe ordered
  representation. A missing map entry must not be silently filtered; if the internal
  invariant is broken, throw a descriptive error.
- `packages/core/src/settings/registry.ts` — remove `this.modules.get(id)!` from
  `getAllModules`, `getDefinitionsForSection`, `getModulesByScope`, and
  `getAllDefinitions` using the same checked helper or an ordered registered-value
  structure.
- `packages/core/src/contributions.test.ts` and
  `packages/core/src/settings/registry.test.ts` — retain ordering/disposal coverage and
  add regression assertions that disposed entries disappear exactly once and remaining
  entries retain order.

## Reproduction / verification

- Review the current `Map.get(...)!` sites listed above. The map/order invariants hold
  today, but the assertions bypass the type checker and would become unsafe if a future
  unregister/clear path changed only one structure.
- Run the focused core tests, `pnpm typecheck`, and `pnpm lint`. Search the two registry
  files for non-null assertions after the change.

## Acceptance criteria

- [ ] No non-null assertion is required to return registry entries or modules.
- [ ] Registration order is unchanged; duplicate registration still throws.
- [ ] Disposing a contribution/module removes it from lookup and ordered enumeration,
      is idempotent, and does not disturb other entries.
- [ ] Any impossible map/order divergence fails with a descriptive error rather than
      silently dropping an entry.

## Manual checks

- Register two commands/panels/settings modules, dispose the first, and verify the
  second remains visible and in the expected order through the desktop/core APIs.

## Automated tests

- Core contribution registry ordering, duplicate, lookup, and disposable tests.
- Settings registry module/definition/section enumeration after disposal.

## Non-goals

- Do not change extension lifecycle ownership or the settings registry's domain-specific
  APIs.
- Do not unify `SettingsRegistry` with `ContributionRegistry`; that future API decision
  remains with the extension API story.
- Do not alter panel rendering or command behavior.
