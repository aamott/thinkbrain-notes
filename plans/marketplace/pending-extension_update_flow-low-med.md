# Extension Update Flow

## Goal

Let users check for updates to installed extensions, apply updates, and roll
back to a previous version when an update breaks something. Builds on the
`extensions` install mechanism and the marketplace registry/metadata work.

## Acceptance Criteria

- User can eventually check for updates across installed extensions against a
  future registry; direct URL updates remain deferred.
- Update path reuses future metadata/signature verification and explicit trusted-
  code consent; soft capability gates are compatibility checks, not a sandbox.
- Previous version is retained so a failed/bad update can be rolled back.
- Update state (last-checked, available update, installed history) lives in OS
  app-data, never in the vault.
- No auto-update without explicit user consent.
- Update failures fail loudly with useful, typed errors.

## References

- `plans/pending-marketplace-low-med.md`
- Prerequisite: `plans/pending-extensions-low-hard.md` (trusted local loading and lifecycle; remote updates are deferred)
- Depends on: `pending-extension_registry-low-med.md`,
  `pending-extension_metadata_signing-low-hard.md`
