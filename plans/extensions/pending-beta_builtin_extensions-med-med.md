# Beta Built-in Extensions Integration

## Goal

Wire the beta built-in features through the trusted extension contribution and
lifecycle APIs. This story covers registration and ownership boundaries only:
journal/calendar, Git sync, and ACP Agent Chat should register through the same
surfaces that future local extensions use. Feature behavior stays in the existing
feature epics; this story must not duplicate their domain logic, storage, sync,
chat, or provider work.

## Acceptance Criteria

- [ ] A desktop bootstrap/integration module registers the beta built-ins through
      the shared extension host and disposes the registrations on shutdown.
- [ ] Journal/calendar registers its activity-bar entry, panel/view, commands,
      note-template contribution, and namespaced settings schema. Journal and
      calendar behavior plus Markdown storage remain in the existing feature
      work.
- [ ] Git sync registers its source-control/panel and command contributions plus
      the lifecycle seam for future background sync tasks. Git operations, file
      watching, conflict handling, and sync UX remain in
      `plans/wip-git-integration-high-hard.md` and its child stories.
- [ ] ACP Agent Chat registers its assistant contribution and scoped provider/
      credential API boundary. ACP host lifecycle, chat UI, permissions, and
      provider behavior remain in `plans/wip-ai-low-hard.md` and `plans/ai/`;
      credential storage is delegated to the native secret-storage story.
- [ ] Each built-in uses canonical contribution namespaces and receives a
      disposable activation scope; deactivation removes its registrations
      without affecting other built-ins.
- [ ] Integration tests cover registration, namespace collision handling,
      activation/deactivation cleanup, and the boundary that keeps feature
      behavior in its owning epic.
- [ ] No third-party install path, manifest loader, separate privilege model, or
      feature-specific behavior is added by this story.

## Dependencies and boundaries

- Depends on the implemented core contribution registries, lifecycle/disposable
  ownership, and desktop scoped settings APIs.
- Depends on the extension boundary in `plans/pending-extensions-low-hard.md`.
- Coordinates with `plans/wip-git-integration-high-hard.md`,
  `plans/wip-ai-low-hard.md`, and the existing journal/calendar feature work;
  those epics remain owners of feature behavior.
- ACP credential consumers depend on
  `plans/extensions/pending-extension_secret_storage-med-hard.md`; the
  encrypted app-data fallback decision remains deferred there.

## References

- `plans/pending-extensions-low-hard.md` — beta boundary and status
- `plans/extensions/pending-internal_contribution_points-low-med.md` — shared
  contribution contracts
- `plans/extensions/pending-extension_execution_model-low-med.md` — lifecycle
  ownership and cleanup
- `plans/extensions/pending-extension_settings-low-med.md` — scoped settings
- `plans/wip-git-integration-high-hard.md` — Git behavior owner
- `plans/wip-ai-low-hard.md` — ACP/agent behavior owner
