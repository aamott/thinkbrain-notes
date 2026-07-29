# UI Package (`packages/ui/`)

Shared Tailwind v4 design system, CSS tokens, and reusable components (shadcn/ui).

## Module Map
- `src/components/`: Reusable React components (`Button.tsx`, `ui/*`).
- `src/styles/`: Design tokens (`tokens.css`). Defines `--tn-*` theme variables.
- `src/lib/`: Styling helpers (`utils.ts` providing `cn()`).
- `src/index.ts`: Package export entry.

## Rules & Patterns
- **Tokens First**: Use `--tn-*` CSS variables or theme classes. Do not use hardcoded hex colors or standard Tailwind color classes (e.g. `bg-red-500`).
- **Composition**: Prefer shadcn-style component composition over deep prop drilling.
- **Accessibility**: Ensure keyboard navigation and proper ARIA attributes on interactive elements.
