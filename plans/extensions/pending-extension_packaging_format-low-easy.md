# Extension Packaging Contract

## Status

⬜ Not implemented. The directory shape is described at a high level, but no validator, package contract, or installable artifact format exists.

## Goal

Define the beta on-disk extension directory and later file-package contract without implementing installation. A development/file-installed extension contains `extension.json`, an entry module, optional `assets/`, and optional `themes/`; paths are deterministic and safe. URL distribution is deferred.

## Discovery questions

- Is the later archive format ZIP only, and what compression/metadata limits apply?
- Must packages be reproducible (sorted entries/normalized timestamps) for future signing?
- Which files are allowed/forbidden, including symlinks, native binaries, hidden files, nested archives?
- Are assets/themes manifest-only or freely addressable by the module?
- What id/version conflict policy applies to an installed directory?

**Stop-and-ask gate:** Do not freeze archive layout, extraction rules, or signing metadata until packaging/security owners answer these questions. This story must not become the file installer.

## Prerequisites

- Approved manifest schema and loader path policy.
- Native path-safety conventions and separate file-install story.

## Exact likely file areas

- Contract docs/fixtures under `plans/extensions/` or `packages/core/src/extensions/fixtures/`.
- Pure directory validator in `packages/core/src/extensions/package.ts` only if useful.
- Native archive extraction belongs to `pending-extension_file_installation-low-med.md`.

## Implementation tasks

1. Document canonical tree, required/optional files, relative-path rules, encoding, and manifest-to-entry/assets relationship.
2. Define future archive metadata and validation contract: traversal/symlink/duplicate-entry/size checks.
3. Add pure fixture validator/tests for valid, missing-entry, forbidden-file, traversal, symlink-marker, and duplicate cases without extraction.
4. Provide loader/installer compatibility checklist and explicitly mark URL/registry fields deferred.

## Acceptance criteria

- [ ] Approved directory and future archive contracts are documented.
- [ ] Validation rules prevent traversal and ambiguous duplicate files.
- [ ] Fixtures/tests cover shape without pretending installation works.
- [ ] App-privileges warning and trusted same-context boundary are explicit.

## Automated validation

- Core/package validator tests.
- `pnpm --filter @thinkbrain/core test -- package`; `pnpm lint`; `pnpm typecheck`.

## Manual desktop/mobile checks

- Desktop: inspect a fixture directory and validator output; do not install an archive.
- Mobile: confirm shared contract does not require desktop-only APIs; archive support remains unimplemented.

## Non-goals

No archive extraction, install/uninstall UI, signing, URL/marketplace, auto-update, native binary loading, or sandbox.

## Handoff artifacts

- Approved directory/archive contract, fixtures, validator/tests, forbidden-path rules, installer I/O specification.

## References

- `plans/extensions/done-extension_manifest_format-low-med.md`
- `plans/extensions/pending-extension_file_installation-low-med.md`
- `plans/technical-decisions.md`
