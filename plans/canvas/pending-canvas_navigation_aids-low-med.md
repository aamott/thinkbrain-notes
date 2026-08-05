# Canvas Navigation Aids

## Goal

Add navigation aids to the canvas surface: a minimap for orientation on large
canvases, zoom-to-fit, and keyboard-driven pan/zoom. Improves usability as
canvases grow.

## Acceptance Criteria

- [ ] Minimap renders a scaled overview of all cards and the current viewport.
- [ ] Clicking/dragging the minimap viewport rectangle pans the main canvas.
- [ ] Zoom-to-fit frames all cards within the viewport.
- [ ] Keyboard shortcuts: arrow keys pan, +/- zoom, `0` resets zoom.
- [ ] Minimap can be toggled on/off via a toolbar control.
- [ ] Minimap and viewport indicator stay in sync during pan/zoom.

## References

- `apps/desktop/src/` — canvas view, minimap component
- `plans/pending-canvas-low-hard.md` — scope (navigation aids)
