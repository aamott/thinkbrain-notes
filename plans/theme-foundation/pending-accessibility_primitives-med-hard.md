# Accessibility Primitives

## Goal

Add accessibility-focused primitives to `packages/ui` using Radix UI-style
patterns (focus traps, keyboard navigation, ARIA wiring) where useful for a
desktop/editor UI. Prioritize primitives the shell actually needs: tooltip,
dialog/modal, and dropdown menu. Avoid adopting a heavy component framework.

## Acceptance Criteria

- [ ] At least one accessibility primitive (tooltip or dialog) is implemented
      in `packages/ui` with proper focus management and keyboard navigation.
- [ ] Primitives use Radix UI-style patterns (uncontrolled, composable,
      accessible) — either via `radix-ui` packages or custom implementations
      following the same principles.
- [ ] No heavy opinionated component framework is introduced.
- [ ] Primitives use co-located CSS Modules and consume shared `--tn-*` design tokens.
- [ ] Primitives are exported from `packages/ui/src/index.ts`.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

## File References

- `packages/ui/src/components/Button.tsx` — existing component pattern
- `packages/ui/src/index.ts` — barrel export
- `packages/ui/package.json` — dependencies (Radix packages to be added if chosen)
- `plans/technical-decisions.md:116-129` — UI components and themes decision
