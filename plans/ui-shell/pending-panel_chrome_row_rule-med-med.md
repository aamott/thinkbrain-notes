# Story: One chrome row per panel

**Status:** ⬜ pending · **Urgency:** med · **Difficulty:** med

> From `docs/reviews/2026-10-03/panels-one-chrome-row-rule` (finding deleted;
> this is the tracked work).

## Context

Two panels still draw chrome outside the title row:

- `ExtensionsPanel.tsx` renders a body toolbar row (notice text + "Add from
  folder…" button, `border-b`). `PanelTitle` already supports an `actions`
  array; the wiring is non-trivial because `onAdd` uses local `busy`/`errors`
  state.
- `HistoryPanel.tsx` has a multi-line header (h3 + explanatory paragraph +
  conditional git notes) that should slim to the one-row rule.

## Acceptance

- [ ] Extensions panel chrome lives in `PanelTitle` actions, not a body row
- [ ] History panel header fits the one-row rule
