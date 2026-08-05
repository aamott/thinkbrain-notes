- name: Non-null assertions in registry lookup helpers
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/contributions.ts
- lines: 64
- description: `entries()` is implemented as
  `order.map((id) => contributions.get(id)!)`. The `!` non-null assertion relies
  on the internal invariant that `order` and `contributions` are always kept in
  sync (every id pushed to `order` is also set in the map, and there is no
  unregister path that could desynchronize them).

  The same pattern appears in the settings registry
  (`packages/core/src/settings/registry.ts` lines 127, 141, 150, 157) with
  `this.modules.get(id)!.module`.

  While the invariant holds today, the project's type-safety guidance prefers
  strict types over `any` and discourages assertions that bypass the type
  checker. A safer formulation would be
  `order.map((id) => contributions.get(id)).filter((c): c is T => c !== undefined)`
  or building the entries array directly during `register` (e.g. keeping a
  `T[]` mirror of `order`), which removes the assertion entirely and keeps the
  invariant structural rather than conventional.

  This is a maintainability concern, not a runtime bug: a future `unregister`
  or `clear` method could easily break the invariant without the type checker
  catching it.
- verification: Read `packages/core/src/contributions.ts` line 64 and
  `packages/core/src/settings/registry.ts` lines 127, 141, 150, 157. Confirmed
  all rely on the same `Map.get(id)!` pattern backed by a parallel order array.
