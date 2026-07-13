# Core Wiring and Design Token Mapping

## Goal

Wire the mobile app to shared `packages/core` business logic (note model,
frontmatter, Markdown parsing, settings shapes) and map the shared design tokens
(colors, spacing, typography) from `packages/core` to React Native `StyleSheet`
values. Ensures both platforms share one source of truth for logic and theming.

## Acceptance Criteria

- [ ] `apps/mobile` imports note/parser/settings logic from `packages/core`
      rather than re-implementing it.
- [ ] Shared design token names from `packages/core` (`designTokenNames`) are
      mapped to concrete React Native color/spacing/typography values.
- [ ] Light/dark theme support via the mapped tokens.
- [ ] No `packages/ui` (React DOM) imports in the mobile app.
- [ ] `pnpm typecheck` passes; `packages/core` remains free of DOM/Node/Tauri
      imports.

## References

- `packages/core/src/index.ts` — `designTokenNames`, `appIdentity`, exports
- `packages/core/src/markdown.ts`, `frontmatter.ts`, `note-model.ts`,
  `settings.ts` — shared logic
- `plans/technical-decisions.md` — UI Components and Themes, Repository
  Structure sections
- `plans/archive/old-structure/deferred/mobile.md` — shared design tokens intent
- `.agents/AGENTS.md` — Styling rule
