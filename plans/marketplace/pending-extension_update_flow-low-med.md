# Extension Update Flow

## Goal

Let users check for updates to installed extensions, apply updates, and roll
back to a previous version when an update breaks something. Builds on the
`extensions` install mechanism and the marketplace registry/metadata work.

## Acceptance Criteria

- User can check for updates across installed extensions (against the registry
  and/or a direct URL).
- Update path reuses the same verification (metadata + signature) and sandbox
  consent flow as a fresh install.
- Previous version is retained so a failed/bad update can be rolled back.
- Update state (last-checked, available update, installed history) lives in OS
  app-data, never in the vault.
- No auto-update without explicit user consent.
- Update failures fail loudly with useful, typed errors.

## References

- `plans/pending-marketplace-low-med.md`
- Prerequisite: `plans/pending-extensions-low-hard.md` (install mechanism, capability sandbox)
- Depends on: `pending-extension_registry-low-med.md`,
  `pending-extension_metadata_signing-low-hard.md`
