# Extension API Surface

## Goal

Expose the third-party extension API surface on top of the internal contribution
points and sandbox. Extensions can contribute views, panels, menus, editor
actions, settings contributions, themes, AI tools, Git tools, and register via
the static registry.

## Acceptance Criteria

- [ ] Extension API exposes typed methods for each contribution point.
- [ ] Extensions activate via declared entry points and receive a scoped API
      object bound to their granted capabilities.
- [ ] Static registry populates commands, panels, menus, etc. from parsed
      manifests.
- [ ] Extensions can contribute themes and settings schemas.
- [ ] AI tool and Git tool hooks are defined (actual AI/Git features are
      delivered by the `ai` and `git-integration` epics; this story only
      provides the hooks).
- [ ] API lives in `packages/core`; platform-specific activation via adapters.
- [ ] Unit/integration tests cover activation, contribution registration, and
      capability-scoped API access.

## References

- `plans/technical-decisions.md` — Extensions section
- `packages/core` — API interfaces
- `apps/desktop/src` — adapter bindings
