# Infinite Pan/Zoom Viewport

## Goal

Implement the infinite canvas viewport in `apps/desktop`: smooth panning and
zooming over a 2D surface that hosts cards. The viewport must stay performant
with many cards by using a transform layer rather than scaling the DOM tree.

## Acceptance Criteria

- [ ] Canvas surface pans via drag (space-drag or middle-mouse) and zooms via
      wheel/trackpad.
- [ ] Zoom is centered on cursor position; clamped to sensible min/max.
- [ ] Viewport transform is applied via a single CSS transform (or lightweight
      renderer) rather than scaling each card.
- [ ] Keyboard navigation (arrow keys to pan, +/- to zoom) works.
- [ ] Zoom-to-fit and reset-zoom controls are available.
- [ ] Pan/zoom state is local to the open canvas tab; reopening restores last
      view.
- [ ] Performance remains smooth with a large number of off-screen cards
      (viewport culling or virtualization where practical).

## References

- `apps/desktop/src/` — new canvas view component
- `packages/ui/` — shared UI primitives if needed
- `plans/pending-canvas-low-hard.md` — rendering architecture decision
