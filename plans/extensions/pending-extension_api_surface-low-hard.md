# Extension API Surface

## Goal

Expose the third-party extension API surface on top of the internal contribution
points and sandbox. Extensions can contribute views, panels, menus, editor
actions, settings contributions, themes, AI tools, Git tools, and register via
the static registry. The API must support the target use cases: Git sync
(file watching, background tasks, conflict resolution UI), ACP agent chat
(network, streaming, credential storage), and journal/calendar (panels,
templates, workspace-scoped settings).

## Acceptance Criteria

- [ ] Extension API exposes typed methods for each contribution point.
- [ ] Extensions activate via declared activation events and receive a scoped
      API object bound to their granted capabilities.
- [ ] Static registry populates commands, panels, menus, etc. from parsed
      manifests.
- [ ] Extensions can contribute themes and settings schemas.
- [ ] Context menu contribution point: extensions declare context menu items
      with placement (editor, explorer, panel) and receive callbacks.
- [ ] Event system: extensions subscribe to typed app events (note.opened,
      file.saved, workspace.switched, file.created, file.deleted,
      file.renamed) and emit custom events.
- [ ] Background task support: extensions can register long-running tasks
      (e.g. Git autosync, file watchers) with lifecycle managed by the runtime.
      Tasks are abortable and cleaned up on deactivate.
- [ ] Extension data storage: extensions can store caches, indices, and
      metadata in `<app_data>/extensions/<id>/` (outside the workspace).
      Distinct from extension settings — this is for larger/structured data.
- [ ] AI tool and Git tool hooks are defined (actual AI/Git features are
      delivered by the `ai` and `git-integration` epics; this story only
      provides the hooks).
- [ ] Extension lifecycle: activate, deactivate, and cleanup hooks. Registered
      resources are auto-cleaned on deactivate.
- [ ] API lives in `packages/core`; platform-specific activation via adapters.
- [ ] Unit/integration tests cover activation, contribution registration,
      capability-scoped API access, event subscription, background tasks,
      data storage, and lifecycle cleanup.

## References

- `plans/technical-decisions.md` — Extensions section
- `packages/core` — API interfaces
- `apps/desktop/src` — adapter bindings
