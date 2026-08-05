# Extension Execution Model

## Goal

Define how extension code is loaded and executed. V1 uses same-context JS
modules in the Tauri webview with capability-gated Tauri commands for security.
No iframe or process isolation in V1 — the capability system provides the
security layer. This decision is documented and the extension runtime
lifecycle (load → activate → deactivate → unload) is implemented.

## Acceptance Criteria

- [ ] Extension runtime loads extension JS modules from the installed extension
      directory.
- [ ] Extensions receive a scoped API object on activation, bound to their
      granted capabilities.
- [ ] Extension lifecycle hooks: `activate()` and `deactivate()`. Registered
      resources (commands, panels, event subscriptions) are auto-cleaned on
      deactivate.
- [ ] Capability enforcement: extensions cannot invoke Tauri commands they lack
      capabilities for. Violations fail loudly with typed errors.
- [ ] Platform-aware capabilities: some capabilities (e.g. `terminal`,
      `process-spawn`) are desktop-only and silently unavailable on mobile.
      Extensions can declare platform requirements in the manifest.
- [ ] Development mode: extensions load from a local directory without
      installation (hot-reload friendly).
- [ ] Unit tests cover lifecycle, capability enforcement, platform gating,
      and cleanup.

## References

- `plans/technical-decisions.md` — Extensions section
- `packages/core` — runtime interfaces and lifecycle types
- `apps/desktop/src` — runtime adapter and Tauri command gating
