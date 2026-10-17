# Search Hit Navigation

Follow-up to `location_centric_history`; not part of its outline-first scope.
Search currently opens a matching file. Extend a result with a precise hit
location and navigate there using the shared location history.

## Acceptance Criteria

- Carry a typed hit location through the search result and opener callbacks.
- Resolve positions against current document contents; a stale result must
  not select unrelated text or produce an out-of-range selection.
- Capture departure before jumping, including within an already-open file.
- Desktop and phone Back/Forward restore the pre-search position; tests cover
  multiple hits, stale results, and unsaved document contents.

Key files: `apps/desktop/src/search/SearchPanel.tsx`,
`apps/desktop/src/panels/panelRegistryModel.tsx`,
`apps/desktop/src/shell/useLocationHistory.ts`.
