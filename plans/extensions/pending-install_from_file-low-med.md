# Install from File (Superseded Alias)

## Status

⬜ Superseded as a duplicate checklist. The canonical implementation package is `pending-extension_file_installation-low-med.md`; no file-install behavior is currently implemented.

## Goal

Keep the historical local-package-install reference aligned with the canonical story: validate a local archive, warn about trusted app privileges, install outside the workspace, and remain independent of URL/marketplace work.

## Discovery questions

See the canonical file-install story for archive type, confirmation frequency, conflicts/rollback, mobile behavior, and extraction limits.

**Stop-and-ask gate:** Do not implement from this alias. Obtain the packaging/security decisions and work only in the canonical story.

## Prerequisites

`pending-extension_packaging_format-low-easy.md` and `pending-extension_file_installation-low-med.md`.

## Exact likely file areas

Use the canonical story’s Rust/native/UI areas; this alias owns no code.

## Implementation tasks

1. Keep this alias status synchronized.
2. Link consumers to the canonical file-install plan.
3. Preserve the explicit app-privileges warning and outside-workspace storage boundary.

## Acceptance criteria

- [ ] No installation is claimed complete here.
- [ ] Canonical file-install story owns implementation and validation.
- [ ] URL install/signing remain out of scope.

## Automated validation

Use canonical installer tests and normal QA; no separate test target.

## Manual desktop/mobile checks

Use canonical story’s install/cancel/malformed archive checks; verify no URL action on either platform.

## Non-goals

URL install, marketplace, signing, auto-update, sandbox, and feature behavior.

## Handoff artifacts

Canonical-story link and duplicate-status note.

## References

- `plans/extensions/pending-extension_file_installation-low-med.md`
- `plans/extensions/pending-extension_packaging_format-low-easy.md`
