# Card Grouping

## Goal

Allow users to group multiple cards into a visual group that moves and resizes
together. Groups provide visual containment and can be collapsed to hide their
contents.

## Acceptance Criteria

- [ ] Selecting multiple cards and grouping creates a group containing them.
- [ ] Group renders as a labeled container behind its child cards.
- [ ] Moving a group moves all child cards; resizing a group reflows children
      where practical.
- [ ] Groups can be collapsed to hide child cards (showing only the group
      header).
- [ ] Ungrouping removes the group container but keeps cards in place.
- [ ] Groups can be nested (a group inside another group).
- [ ] Group label is editable.

## References

- `apps/desktop/src/` — group component
- `packages/core/src/` — canvas document model (groups)
