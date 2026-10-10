# Story: Finish the native/ boundary

The documented rule — all Tauri IPC through `apps/desktop/src/native/` — is
only half-true (`docs/reviews/2026-10-10/architecture-shell-state-med-hard.md`
#5, `architecture-native-backend-med-hard.md` #4, and
`architecture-core-extensions-editor-med-hard.md` #6 all flag it).

Escapes today: `@tauri-apps/api/event` imported directly by
`workspaceWatcher.ts`, `gitLinkImport.ts`, `syncEvents.ts`; `isTauri()` and
platform checks imported into shell/settings/workspace feature code.

## Acceptance

- [ ] Typed `native/events` subscribe helpers (workspace-changed, sync,
      git-import payloads) replacing direct event imports.
- [ ] `native/runtime` capability (`isNativeHost`) or fallback-in-adapter
      pattern; `isTauri()` not imported outside `native/`.
- [ ] Import-boundary lint rule: no `@tauri-apps/*` outside `native/` and
      composition roots.
