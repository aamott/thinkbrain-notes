# Heading Fragment Navigation

Deferred until `tab_local_link_navigation` is complete. Do not expand this
feature while correcting basic link activation and same-tab navigation.

## Acceptance Criteria

- Support same-file and cross-file Markdown/wiki heading links through the
  current tab's existing navigation trail.
- Define heading normalization, duplicate-heading disambiguation, and missing
  target feedback before implementation.
- Resolve against current contents, including unsaved open notes; no
  intermediate file-top visit or stale asynchronous jump.
- Test encoded fragments, duplicate headings, missing targets, and Back/Forward.

Key files: `packages/core/src/linkResolver.ts`,
`apps/desktop/src/shell/useLocationHistory.ts`.
