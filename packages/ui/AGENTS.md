# UI Package (`packages/ui/`)

Shared Tailwind v4 design system, CSS tokens, and reusable components (shadcn/ui).

## Module Map
- **`src/components/`**: Reusable React components (`Button.tsx`, `ui/*`).
- **`src/styles/`**: Design tokens (`tokens.css`) defining `--tn-*` theme variables.
- **`src/lib/`**: Styling helpers (`utils.ts` providing `cn()`).
- **`src/index.ts`**: Package export entry point.

## Rules & Patterns
- **Tokens First**: Use `--tn-*` CSS variables or mapped theme classes. Avoid hardcoded hex colors or standard Tailwind color utilities (e.g. `bg-red-500`).
- **Composition**: Prefer shadcn-style component composition over deep prop drilling.
- **Accessibility**: Ensure keyboard navigation, visible focus indicators, and semantic HTML.
