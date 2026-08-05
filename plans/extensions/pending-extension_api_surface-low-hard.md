# Extension API Surface

## Goal

Expose the local extension API surface on top of the internal contribution
points and trusted same-context runtime. Extensions can contribute views, panels,
menus, editor actions, settings contributions, themes, AI tools, Git tools, and
register via the static registry. Soft capabilities are compatibility gates, not
sandboxing. The API must support the target beta built-ins: Git sync (file
watching, background tasks, conflict resolution UI), ACP agent chat (network,
streaming, native credential storage), and journal/calendar (panels, templates,
workspace-scoped settings), while feature ownership remains in their existing
epics.

## Acceptance Criteria

- [ ] Extension API exposes typed methods for each contribution point. Relative
      contribution IDs use lowercase kebab-case and are namespaced by the
      canonical extension id.
- [ ] Extensions activate via declared activation events and receive a scoped
      API object with compatibility results and an explicit app-privileges
      warning.
- [ ] Static registry populates commands, panels, menus, etc. from parsed
      manifests.
- [ ] Extensions can contribute themes and namespaced non-secret settings
      schemas through the existing settings registry.
- [ ] Context menu contribution point: extensions declare context menu items
      with placement (editor, explorer, panel) and receive callbacks.
- [ ] Event system: extensions subscribe to typed app events (note.opened,
      file.saved, workspace.switched, file.created, file.deleted,
      file.renamed) and emit custom events.
- [ ] Background task support: extensions can register long-running tasks
      (e.g. Git autosync, file watchers) with lifecycle managed by the runtime.
      Tasks are abortable and cleaned up on deactivate.
- [ ] Extension data storage: extensions can store caches, indices, and
      metadata in `<app_data>/extensions/<id>/` (outside the workspace), with
      ownership tied to the activation disposable scope.
- [ ] AI tool and Git tool hooks are defined (actual AI/Git features are
      delivered by the `ai` and `git-integration` epics; this story only
      provides the hooks). ACP credentials use the native secret-store adapter,
      never JSON or bulk/raw cross-extension reads.
- [ ] Extension lifecycle: activate, deactivate, and cleanup hooks. Registered
      resources are auto-cleaned on deactivate, unload, and failed activation;
      subscriptions, timers, watchers, and background tasks are disposable.
- [ ] API lives in `packages/core`; platform-specific activation via adapters.
- [ ] Unit/integration tests cover activation, contribution registration,
      capability-scoped API access, event subscription, background tasks,
      data storage, and lifecycle cleanup.

## References

- `plans/technical-decisions.md` — Extensions section
- `plans/extensions/pending-beta_builtin_extensions-med-med.md` — beta built-in
  registration consumers
- `plans/extensions/pending-extension_secret_storage-med-hard.md` — native
  credential boundary for ACP/provider hooks
- `packages/core` — API interfaces
- `apps/desktop/src` — adapter bindings
