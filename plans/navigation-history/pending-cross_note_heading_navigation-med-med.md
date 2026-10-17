# Cross-Note Heading Navigation

Depends on: `heading_fragment_navigation`.

Extend heading links to `[label](Note.md#heading)` and `[[Note#Heading]]`,
reusing same-note heading matching and tab-local history.

## Acceptance Criteria

- Open the destination in the current logical tab and land at its heading,
  without recording an intermediate file-top visit.
- Use current unsaved contents when the target is already open.
- Respect save failures and newer navigation intent; do not apply stale jumps
  after a tab/workspace switch, close, rename, or asynchronous load.
- Define missing-heading feedback for a destination file before implementation.
- Cover desktop/phone Back/Forward, already-open targets, failed loads, encoded
  fragments, and duplicate headings.
