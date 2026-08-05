# Duplicated destructive-tint styling between `.error` and `.actionError`

- **Difficulty:** trivial
- **Urgency:** low
- **File:** `apps/desktop/src/workspace/WorkspaceExplorer.module.css`
- **Lines:** 195-232

## Description
The new `WorkspaceExplorer.module.css` defines two error surfaces that repeat the same destructive border/background recipe:

```css
.error {
  border: 1px solid color-mix(in srgb, var(--tn-color-destructive) 45%, var(--tn-color-border));
  background: color-mix(in srgb, var(--tn-color-destructive) 9%, transparent);
  color: var(--tn-color-danger);
  ...
}

.actionError {
  border-bottom: 1px solid color-mix(in srgb, var(--tn-color-destructive) 45%, var(--tn-color-border));
  background: color-mix(in srgb, var(--tn-color-destructive) 9%, transparent);
  color: var(--tn-color-danger);
  ...
}
```

The `color-mix` percentages (45% border, 9% background) and the `--tn-color-danger` text color are duplicated. A similar `8%` destructive tint also appears in `CommandPalette.module.css` `.notice`, so the "destructive surface" look is being hand-copied per component rather than expressed once.

## Recommendation
Extract a shared error-surface declaration (e.g. a `.destructiveSurface` utility or a CSS custom property pair like `--tn-destructive-border` / `--tn-destructive-tint` in `tokens.css`) and apply it to both `.error` and `.actionError`, keeping only the layout-specific properties (margin, padding, border radius vs. bottom-only border) in each rule. This keeps the destructive tint consistent if the design tokens change.

## Verification
Read `WorkspaceExplorer.module.css` lines 195-232; both `.error` and `.actionError` repeat the same `color-mix` border/background and `--tn-color-danger` color. `CommandPalette.module.css` `.notice` (line 62) uses a near-identical `8%` tint, confirming the pattern is being copied rather than shared.

## Resolution (2026-07-18) — WONTFIX

The two declarations are short, intentionally differ in border geometry, and are confined to one component stylesheet. Adding a global utility or new design tokens for this small local overlap would add indirection without a concrete consistency benefit.
