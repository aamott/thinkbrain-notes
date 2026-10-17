# Heading Fragment Navigation

Follow-up to `location_centric_history`; not part of its outline-first scope.
Make internal Markdown/wiki heading links navigate through the shared location
history rather than only opening the file.

## Acceptance Criteria

- Support same-file fragments and cross-file heading targets.
- Define heading normalization, duplicate-heading disambiguation, and missing
  target feedback before implementation; never silently jump to another heading.
- Capture departure before jumping; Back/Forward restore locations without
  changing document contents or undo state on desktop and phone.
- Test encoded fragments, duplicate headings, missing targets, and links to
  an already-open document.

Key files: `packages/core/src/linkResolver.ts`,
`apps/desktop/src/shell/useShellState.ts`,
`apps/desktop/src/shell/phone/usePhoneOpeners.ts`.
