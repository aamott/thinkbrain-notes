# Extension Contribution Surfaces

## Status

⬜ Focused child story. Existing command/panel/editor/settings contracts remain implemented; views, menus, context menus, themes, and additional editor actions are pending. D44's React editor-header slot is isolated in `pending-editor_header_contribution-high-med.md`.

## Goal

Add only the approved typed contribution facades for views, menus, context menus, themes, and editor actions. Every registration is extension-scoped and owned by the activation disposable scope.

## Discovery questions and STOP gate

- Which contribution locations, view renderer contract, theme format, and editor-action payloads are beta-stable?
- Which desktop/mobile layouts, keyboard behavior, accessibility names, and unavailable states are approved?
- Are custom renderers trusted same-context modules only, and what cleanup occurs on replacement?

**STOP gate:** Do not create UI mockups, choose contribution IDs, or implement React-facing contributions until the relevant product/API owner answers these questions and approves the desktop and mobile placement/accessibility notes.

## Dependencies

- Manifest parser, compatibility evaluator, lifecycle/bootstrap, and existing contribution registry.
- `pending-extension_api_surface-low-hard.md` rollup and `pending-extension_events_tasks-low-med.md` only for shared disposable contracts.
- Existing panel/tab/menu registries; no feature epic behavior.

## Likely files

- `packages/core/src/contributions.ts` and focused extension contribution types/tests.
- `apps/desktop/src/extensions/desktopExtensionHost.ts` and `apps/desktop/src/extensions/` facades/tests.
- Existing `apps/desktop/src/panels/`, `commands/`, `tabs/`, and theme registry only after approval.

## Small task sequence

1. Record the approved contribution matrix and canonical IDs.
2. Define platform-neutral typed contribution records and disposable registration handles.
3. Adapt approved desktop registries without direct Tauri calls or duplicate feature behavior.
4. Add collision, unavailable-platform, disposal, and accessibility contract tests.

## Acceptance criteria

- [ ] Only approved contribution kinds/locations are accepted and IDs are collision-checked.
- [ ] Registrations disappear on deactivate, failed activation, unload, and host disposal.
- [ ] Mobile/unavailable contributions are explicit and never described as sandboxing.
- [ ] No feature-specific journal, Git, AI, or installer behavior is added.

## Automated validation

Run focused core/desktop contribution tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Manual desktop/mobile checks

Desktop: register a fixture view/menu/theme/action, verify approved placement, keyboard/focus behavior, and cleanup. Mobile: verify approved narrow layout or explicit unavailable state, touch targets, and no desktop-only native call.

## Non-goals

No manifest loading, event/task runtime, app-data storage, secret storage, installer, marketplace, sandbox, feature behavior, or duplicate React editor-header registry.

## Handoff expectations

Deliver the approved contribution matrix, likely-file diff, typed contracts/tests, accessibility notes, disposal report, and unresolved API/layout questions. Mark exact paths as likely until implementation confirms them.

## References

- `plans/extensions/pending-extension_api_surface-low-hard.md`
- `plans/extensions/done-extension_manifest_format-low-med.md`
- `plans/extensions/done-extension_lifecycle_bootstrap-low-med.md`

## Blocked-on note from the loader story

A locally loaded extension cannot contribute a panel today. `DesktopPanelContribution.factory`
returns a `ReactNode`, and a pre-bundled extension that imports React runs against a
second copy of the library, breaking hooks across the boundary. The loader reports
and strips declared panels. This story owns the fix: a framework-neutral mount
contract (the extension receives an element and owns its contents), which is a
public API and must be designed on its own terms.
