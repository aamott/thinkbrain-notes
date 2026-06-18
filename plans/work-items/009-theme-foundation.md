# Work Item 009: Theme Foundation

## Status

Planned

## Goal

Create the built-in theme foundation using CSS variables and reusable UI tokens.

## Required Reading

- `plans/004-technical-decisions.md`
- `plans/005-mvp-scope.md`
- `plans/architecture/themes.md`
- `plans/architecture/ui-shell.md`

## Scope

Implement:

- CSS variable token system
- default light theme
- default dark theme
- theme selection state/setting if settings are available
- basic styling for shell/editor/sidebar surfaces

## Non-Goals

Do not implement installable themes, remote theme loading, theme marketplace, or public extension APIs.

## Dependencies

- `001-project-scaffold.md`
- `007-settings.md` if theme selection is persisted

## Owns

- `packages/ui` theme tokens/components
- desktop global styles
- theme-related tests if practical

## Acceptance Criteria

- [ ] App has consistent design tokens.
- [ ] Light and dark themes are available.
- [ ] Theme implementation does not require extension loading.
- [ ] Core shell surfaces use the tokens.

## Validation

Run lint/typecheck/build and any UI tests available.
