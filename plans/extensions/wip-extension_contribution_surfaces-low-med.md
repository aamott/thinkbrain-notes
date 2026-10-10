# Extension Contribution Surfaces

## Status

🟨 Panel mount contract and panel header actions shipped; menus, context
menus, themes, and additional editor actions remain behind the STOP gate.
D44's editor-header slot is separate (shipped).

Shipped: `context.panels.register({ side, mount })` — a framework-neutral
`mount(element, panel)` that owns the element's contents and returns an
optional cleanup; `panels/extensionPanelMount.tsx` adapts it to the React
factory the registry stores, so disk extensions get an activity-bar (left) or
title-bar (right) entry identical to a built-in's. Host state reaches a
mounted panel through `panel.state` at mount and `panel.onDidChange` after;
only `rootPath` and `documentContents` are forwarded, never shell props.
`actions: PanelAction[]` (`{ id, label, icon, run }`) render as panel-header
buttons; throwing actions are reported, never propagated.
`examples/extensions/hello-notes` is the worked example, pinned by an e2e test.

## Goal

Add only the approved typed contribution facades for views, menus, context
menus, themes, and editor actions — every registration extension-scoped and
owned by the activation disposable scope.

## Open questions (STOP gate)

Which contribution locations, view-renderer contract, theme format, and
editor-action payloads are beta-stable? Which desktop/mobile layouts,
keyboard behavior, accessibility names, and unavailable states are approved?
Custom renderers are trusted same-context only — what cleanup on replacement?

Do not choose contribution IDs or implement React-facing contributions until
the product/API owner approves placement and accessibility notes.

## Remaining panel-adjacent gaps

Header actions are static for the registration's lifetime (no
enabled/disabled state or dynamic list); the header `•••` overflow button is
inert chrome; there is no styling contract beyond the DOM the extension
writes.

## Likely files

- `packages/core/src/contributions.ts` + focused contribution types/tests.
- `apps/desktop/src/extensions/` host facades/tests; existing
  `panels/`/`commands/`/`tabs/` registries only after approval.

## Acceptance criteria

- [ ] Only approved contribution kinds/locations accepted; IDs collision-checked.
- [ ] Registrations disappear on deactivate, failed activation, unload, disposal.
- [ ] Mobile/unavailable contributions explicit; never called sandboxing.
- [ ] No feature-specific journal/Git/AI or installer behavior added.

## Validation

Focused core/desktop contribution tests, `pnpm lint`, `pnpm typecheck`,
`pnpm build`; manual desktop/mobile checks for placement, keyboard/focus,
cleanup, and unavailable states.
