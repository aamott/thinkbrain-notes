# Extension Execution Model

## Goal

Define how trusted local extension code is loaded and executed. The beta uses
same-context JS modules in the Tauri webview for maintainability and easy
development. Capabilities are soft declarations/compatibility gates, not a
security layer; extensions run with app privileges. The runtime lifecycle
(load → activate → deactivate → unload) owns disposables and automatic cleanup.

## Acceptance Criteria

- [ ] Extension runtime loads extension JS modules from the installed extension
      directory.
- [ ] Extensions receive a scoped API object on activation, with capability
      compatibility results and an explicit app-privileges warning.
- [x] Extension lifecycle hooks: `activate()` and `deactivate()`. Registered
      resources (including contribution registrations and returned disposables)
      are owned by a disposable scope and auto-cleaned on deactivate, unload,
      host disposal, and failed activation. Lifecycle and cleanup behavior is
      covered by core and desktop tests.
- [ ] Capability compatibility checks disable unsupported operations or warn;
      they are not treated as security enforcement.
- [ ] Platform-aware capabilities: some capabilities (e.g. `terminal`,
      `process-spawn`) are unavailable on mobile and produce a compatibility
      result. Extensions can declare platform requirements in the manifest.
- [ ] Development mode: extensions load from a local directory without
      installation (hot-reload friendly).
- [ ] Later file installation warns that the extension runs with app privileges;
      URL installation and strong isolation are deferred.
- [x] Unit tests cover lifecycle, disposable ownership, and automatic cleanup.
- [ ] Capability enforcement and platform-gating tests remain pending with the
      manifest/runtime compatibility work.

## References

- `plans/technical-decisions.md` — Extensions section
- `plans/pending-extensions-low-hard.md` — trusted beta boundary
- `packages/core` — runtime interfaces, compatibility results, and lifecycle types
- `apps/desktop/src` — runtime adapter and disposable ownership
