# Right Popout Inspectors

## Goal

Add the mockup-v3 right popout for note outline, properties, backlinks, and
the assistant integration point while respecting data-owning epics.

## Acceptance Criteria

- [ ] Outline derives headings from the active document without rewriting it
      and supports accessible navigation to an editor location.
- [ ] Properties displays parsed frontmatter read-only and handles missing or
      malformed frontmatter clearly.
- [ ] Backlinks renders a linked empty/loading state until indexing/graph APIs
      exist; it does not invent a second link index.
- [ ] Assistant panel mounts only the `ai` epic integration component and has
      a useful unavailable/configuration state before it is enabled.
- [ ] Opening/closing the active right view updates layout state and does not
      unmount an active editor or lose unsaved changes.

## References

- `mockup_v3/src/components/RightPopout.tsx`
- `packages/core/src/{frontmatter,markdown}.ts`
- `plans/graph.md`
- `plans/ai.md`
