# Story: Responsive Layout Breakpoints

## Goal

Add responsive breakpoints to the desktop shell so it adapts to phone screens.
Phone-first on small screens (single panel, bottom tab navigation), multi-panel
on large screens (current desktop layout). Use co-located CSS Modules, shared
`--tn-*` tokens, and CSS media queries. Touch-friendly hit targets (44px
minimum).

## Acceptance Criteria

- [ ] Shell collapses to a single-panel layout on narrow screens.
- [ ] Bottom tab navigation appears on mobile; desktop sidebar nav is unchanged
      on wide screens.
- [ ] Touch-friendly hit targets (≥44px) on mobile.
- [ ] Desktop layout is unchanged on wide screens.
- [ ] `./scripts/qa.sh` passes.

## References

- `plans/pending-mobile-med-hard.md` — epic context
- `packages/ui/src/styles/tokens.css` — shared `--tn-*` tokens
