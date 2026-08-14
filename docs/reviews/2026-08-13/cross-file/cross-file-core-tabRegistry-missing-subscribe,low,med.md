- name: Core TabRegistry lacks subscribe — desktop wraps it to add subscription
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/layout/index.ts (and apps/desktop/src/tabs/tabRegistry.ts)
- lines: layout/index.ts 42-87; tabRegistry.ts 79-141
- description: `ContributionRegistry` (in `packages/core/src/contributions.ts`) exposes `subscribe(listener)` for `useSyncExternalStore` integration. The core `TabRegistry` (in `packages/core/src/layout/index.ts`) does not — it only exposes `register`, `get`, `entries`. The desktop layer (`apps/desktop/src/tabs/tabRegistry.ts`) wraps the core registry and adds its own `subscribe` + listener set to drive React subscriptions.

  This is an architectural inconsistency: two core registries with similar contracts expose different surfaces. The desktop wrapper exists primarily to compensate for the missing core `subscribe`. If `TabRegistry` is expected to back React views (it is — `editorHeaderRegistry.tsx` and `tabRegistry.ts` both use `useSyncExternalStore`), the core contract should include `subscribe` so the desktop layer does not have to re-implement listener management.

  Suggested action: add `subscribe(listener: () => void): () => void` to the core `TabRegistry` interface and `createTabRegistry`, mirroring `ContributionRegistry`. Then simplify `apps/desktop/src/tabs/tabRegistry.ts` to delegate `subscribe` to the core registry instead of maintaining a parallel listener set. This is not a compaction win in core (adds ~10 lines) but removes ~15 lines of wrapper boilerplate in the desktop layer and aligns the two registry contracts.

- verification: Read `layout/index.ts` lines 42-87 (no `subscribe`). Read `contributions.ts` lines 24-43 (`subscribe` present). Read `tabRegistry.ts` lines 79-141 (desktop adds its own `subscribe` + listeners). Grepped `useSyncExternalStore` consumers in `apps/desktop/src/tabs` — `editorHeaderRegistry.tsx` line 15 and `tabRegistry.ts` line 37.
