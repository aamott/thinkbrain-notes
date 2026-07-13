# Connections Between Cards

## Goal

Draw connections (edges) between cards on the canvas. Edges support labels and
directional arrows. Edges update dynamically as cards move.

## Acceptance Criteria

- [ ] Drag from a card edge handle to another card creates a connection.
- [ ] Edges render as bezier or orthogonal paths between card anchor points.
- [ ] Edges update in real time as either endpoint card moves or resizes.
- [ ] Edges support an optional text label rendered at the midpoint.
- [ ] Edges are directional (arrowhead) or undirected, configurable.
- [ ] Edges can be selected, edited (label, direction), and deleted.
- [ ] Edge styling (color, width) follows theme tokens.

## References

- `apps/desktop/src/` — edge rendering component
- `packages/core/src/` — canvas document model (edges)
- `packages/ui/src/styles/` — theme tokens for styling
