# Beta Built-in Extension Registration Boundaries

## Status

🟨 `journal-calendar` and `note-stats` are registered through the extension
host with D47 ids (`apps/desktop/src/extensions/builtins/`). Git sync and ACP
Agent Chat registration-only modules remain behind the stop-and-ask gate —
their relative ids and activation events are not owner-approved. Behavior
stays in the owning epics.

## Goal

Register beta built-ins through the shared contribution/lifecycle APIs with
canonical namespaces and disposable ownership. Built-ins are trusted app code;
no third-party install path or separate privilege model.

## Canonical namespaces — APPROVED D47

- Extension ids: `journal-calendar`, `git`, `agent-chat`.
- Relative ids are semantic lowercase kebab-case, host-prefixed as
  `${extensionId}.${id}`; no type/vendor prefixes.
- `journal-calendar` local ids: panel `journal`, tab `calendar`, commands
  `new-entry`, `today`, `open-calendar`, editor header `metadata-widget`.

## Open questions (stop-and-ask gate)

Do not add mockups, registration code, or placeholders for Git/agent-chat
until the owning epics approve: relative contribution ids, activation events,
panel/menu placement (desktop + mobile), unavailable-feature behavior, and
which ACP credential / Git background-task seams are stable enough to
register. A registration is not feature implementation.

## Remaining tasks

1. Collect owner-approved Git/agent-chat ids, events, capabilities, placement.
2. Add registration-only modules under `apps/desktop/src/extensions/builtins/`
   delegating behavior to `plans/auto-sync/` and `plans/ai/`; wire through
   `bootstrap.ts`.
3. Test collisions, disposal, failed activation, failure isolation; assert no
   feature implementation is imported.

## Acceptance criteria

- [x] D47 fixes extension namespaces and journal/calendar relative ids.
- [x] `journal-calendar` and `note-stats` register as built-ins through one
      bootstrap with disposable scope.
- [ ] Git sync and ACP Agent Chat registration modules added with
      owner-approved ids only.
- [ ] Failures are typed and do not strand other built-ins.
- [ ] Journal/Git/AI behavior stays in its owning epics.
- [ ] ACP credentials route to native secret storage; no JSON secret path.
- [ ] Desktop/mobile status and unavailable behavior are approved/tested.
- [ ] No installer, manifest loader, privilege model, or marketplace path.

## References

- `plans/auto-sync/`, `plans/ai/` (awaiting its planning pass),
  `extensions/extension_secret_storage`
- Lifecycle/bootstrap — shipped; story file deleted per plan-review policy.
