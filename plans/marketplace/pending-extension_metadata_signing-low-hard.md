# Extension Metadata and Signing

## Goal

Define the metadata carried by future installable extensions (building on the
`extensions` epic's `extension.json` manifest) and a signature scheme for
integrity verification. Signing is deferred beyond the trusted-local beta and
must be revisited alongside remote-code trust; direct URL installation is also
deferred.

## Acceptance Criteria

- Installable extension packages carry a manifest with the fields the
  marketplace UI and compatibility gates need (id, name, version, author,
  declared capabilities, etc.).
- Packages may carry a signature that a future installer verifies before
  installation; signing is not a beta prerequisite.
- Verification failure blocks a future remote install with a loud, typed error.
- Signature design is reviewed alongside remote-code trust and any stronger
  isolation model; it is not treated as a capability sandbox.
- Direct URL installs remain deferred; file-install verification can be designed
  later without assuming a centralized authority.
- Signature scheme design is documented before implementation begins.

## References

- `plans/pending-marketplace-low-med.md`
- Prerequisite: `plans/pending-extensions-low-hard.md` (manifest format, trusted local loading, compatibility gates)
