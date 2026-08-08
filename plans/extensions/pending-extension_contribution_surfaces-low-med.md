# Extension Contribution Surfaces

## Status

🟨 The panel mount contract and panel header actions are shipped; menus,
context menus, themes, and additional editor actions are still pending. D44's React editor-header slot is
isolated in `pending-editor_header_contribution-high-med.md`.

An extension loaded from disk now contributes panels on equal footing with a
built-in: `context.panels.register({ side, mount })` takes a framework-neutral
`mount(element, panel)` that owns the element's contents and returns an
optional cleanup. `apps/desktop/src/panels/extensionPanelMount.tsx` adapts it
to the React factory the registry stores, so the activity bar (left) and title
bar (right) render both kinds identically, and the loader no longer strips
declared panels. Host state reaches a mounted panel through `panel.state` at
mount time and `panel.onDidChange(listener)` afterwards; only `rootPath` and
`documentContents` are forwarded, never the shell's React props.

A panel also contributes `actions: PanelAction[]` — `{ id, label, icon, run }`
records the shell renders as buttons in the panel header (`PanelTitle`), so an
extension gets header buttons without rendering any markup. A throwing or
rejecting action is reported, never propagated into the shell.

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

## Resolved: the loader story's blocked-on note

A locally loaded extension could not contribute a panel, because
`DesktopPanelContribution.factory` returns a `ReactNode` and a pre-bundled
extension that imports React runs against a second copy of the library. Fixed
by the mount contract described under Status; the loader's `panels_not_supported`
diagnostic is gone. `examples/extensions/hello-notes` contributes a panel this
way and is loaded verbatim by an end-to-end test.

Remaining panel-adjacent gaps: header actions are static for the lifetime of
the registration (no enabled/disabled state or dynamic list), the header's
`•••` overflow button is still inert chrome, and there is no styling contract
beyond whatever DOM the extension writes.
