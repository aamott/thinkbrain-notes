# Heading Fragment Navigation

Depends on: `tab_local_link_navigation`.

Same-note slice only: `[label](#heading)` and `[[#Heading]]`, including wiki
aliases. Cross-note fragments belong to `cross_note_heading_navigation`.

## Design

- Add a current-note heading target to the shared link-target union. Keep
  ordinary file/URL resolution unchanged; decode fragment escapes once.
- Match normalized ATX heading labels: NFC, lowercase, punctuation removed
  except hyphens/underscores, whitespace collapsed to hyphens. Preserve Unicode
  letters/numbers/marks. Ignore frontmatter and fenced code; remove inline
  emphasis/code/link syntax from labels.
- Assign unique slugs in source order: `heading`, `heading-1`, etc., avoiding
  collisions with literal suffixed headings. An empty fragment goes to line 1.
- Read current editor contents through the existing view registry, then use
  `navigateToLine`. No new history, pending jump, file load, or save is needed.
- Missing headings raise a transient warning and leave location/history alone.

## Acceptance Criteria

- Both link syntaxes follow in desktop and phone, including explicit keyboard
  follow in source mode; revealed plain clicks remain editing gestures.
- Jump atomically within the same tab, using current unsaved contents. One Back
  restores departure selection/scroll; Forward returns to the heading.
- Encoded/Unicode fragments, duplicate slug collisions, formatting, frontmatter,
  fenced pseudo-headings, missing targets, and repeat/no-op jumps have coverage.
- No document write or additional visible tab is needed for a same-note jump.

Key files: `packages/core/src/linkResolver.ts`,
`apps/desktop/src/panels/outlineModel.ts`,
`apps/desktop/src/tabs/editorLocationRegistry.ts`,
`apps/desktop/src/shell/useLocationHistory.ts`.
