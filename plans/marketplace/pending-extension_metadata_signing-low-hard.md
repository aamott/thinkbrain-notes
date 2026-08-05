# Extension Metadata and Signing

## Goal

Define the metadata carried by installable extensions (building on the
`extensions` epic's `extension.json` manifest) and a signature scheme for
integrity verification. Signing must work for both registry-sourced and
direct (URL/file) installs and must not require a centralized authority for
direct installs.

## Acceptance Criteria

- Installable extension packages carry a manifest with the fields the
  marketplace UI and sandbox need (id, name, version, author, declared
  capabilities, etc.).
- Packages carry a signature that the installer verifies before installation.
- Verification failure blocks installation with a loud, typed error.
- Signature scheme is compatible with the `extensions` capability sandbox and
  does not weaken it.
- Direct (URL/file) installs can be verified without contacting a centralized
  authority.
- Signature scheme design is documented before implementation begins.

## References

- `plans/pending-marketplace-low-med.md`
- Prerequisite: `plans/pending-extensions-low-hard.md` (manifest format, capability sandbox)
