# Story: Finish the native/ boundary

Tauri events and runtime/platform probes now pass through
`apps/desktop/src/native/`. Workspace event translation and sync refresh policy
remain in their feature modules.

## Acceptance

- [x] Typed `native/events` subscriptions (workspace-changed, sync,
      git-import payloads) replacing direct event imports.
- [x] `native/runtime` probes (`isNativeHost`, `isApplePlatform`);
      `isTauri()` not imported outside `native/`.
- [x] Import-boundary lint rule: no static/type/re-export, dynamic, or
      literal `require` of `@tauri-apps/*` outside `native/`, including startup.

Validation: `pnpm qa` passes. Focused tests cover event payloads, rejection and
async cleanup, canonical-root filtering, runtime probes, and the real lint rule.
Stacked on `settings_source_cleanup` to avoid overlapping-import conflicts.
