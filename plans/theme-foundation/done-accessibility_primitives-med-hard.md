# Accessibility Primitives

## Goal

Add accessibility-focused primitives to `packages/ui` using Radix UI-style
patterns (focus traps, keyboard navigation, ARIA wiring) where useful for a
desktop/editor UI. Prioritize primitives the shell actually needs: tooltip,
dialog/modal, and dropdown menu. Avoid adopting a heavy component framework.

## Acceptance Criteria

- [x] At least one accessibility primitive (tooltip or dialog) is implemented
      in `packages/ui` with proper focus management and keyboard navigation.
- [x] Primitives use Radix UI-style patterns (uncontrolled, composable,
      accessible) — either via `radix-ui` packages or custom implementations
      following the same principles.
- [x] No heavy opinionated component framework is introduced.
- [x] Primitives use shared `--tn-*` design tokens.
- [x] Primitives are exported from `packages/ui/src/index.ts`.
- [x] `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

## File References

- `packages/ui/src/components/Button.tsx` — existing component pattern
- `packages/ui/src/index.ts` — barrel export
- `packages/ui/package.json` — dependencies (Radix packages to be added if chosen)
- `plans/wip-theme-foundation-high-hard.md` — UI components and themes decision
