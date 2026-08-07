# Reusable Base Components

## Goal

Expand `packages/ui` with reusable base components beyond the existing `Button`.
Cover the form and layout primitives needed by the desktop shell: text input,
select, checkbox, field/label wrapper, and a surface/panel container.

## Acceptance Criteria

- [ ] `packages/ui` exports reusable components for: text input, select,
      checkbox, field (label + help + error wrapper), and panel/surface
      container.
- [ ] Each component uses a co-located CSS Module backed by shared `--tn-*`
      tokens — no inline styles.
- [ ] Components consume the CSS variable tokens (no hardcoded colors).
- [ ] All components are exported from `packages/ui/src/index.ts`.
- [ ] Existing `Button` component is reviewed for consistency with new
      components (styling approach, naming).
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

## File References

- `packages/ui/src/components/Button.tsx` — existing component (reference for patterns)
- `packages/ui/src/index.ts` — barrel export
- `packages/ui/src/lib/classNames.ts` — class merging utility
- `apps/desktop/src/settings/SettingsContent.tsx` and
  `apps/desktop/src/settings/ThemeSectionControls.tsx` — current settings
  consumers
