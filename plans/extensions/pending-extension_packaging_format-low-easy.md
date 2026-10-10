# Extension Packaging Contract

## Status

⬜ Not implemented. The directory shape is described at a high level; no
validator, package contract, or installable artifact format exists.

## Goal

Define the beta on-disk extension directory and the later file-package
contract without implementing installation. A dev/file-installed extension
contains `extension.json`, an entry module, optional `assets/` and `themes/`;
paths are deterministic and safe. URL distribution is deferred.

## Discovery questions (stop-and-ask gate)

Is the later archive ZIP only, with what compression/metadata limits? Must
packages be reproducible (sorted entries, normalized timestamps) for future
signing? Which files are allowed/forbidden — symlinks, native binaries,
hidden files, nested archives? Are assets/themes manifest-only or freely
addressable? Id/version conflict policy for an installed directory?

Do not freeze archive layout, extraction rules, or signing metadata until
packaging/security owners answer. This story must not become the installer.

## Prerequisites

- Approved manifest schema and loader path policy; native path-safety
  conventions; `extension_file_installation` owns extraction.

## Likely files

- Contract docs/fixtures under `plans/extensions/` or
  `packages/core/src/extensions/fixtures/`; a pure directory validator in
  `packages/core/src/extensions/package.ts` only if useful.

## Remaining tasks

1. Document canonical tree, required/optional files, path rules, encoding,
   manifest-to-entry/assets relationship.
2. Future archive metadata + validation contract: traversal/symlink/
   duplicate/size checks.
3. Pure fixture validator/tests (valid, missing-entry, forbidden-file,
   traversal, duplicate) — no extraction.
4. Loader/installer compatibility checklist; mark URL/registry fields
   deferred.

## Acceptance criteria

- [ ] Approved directory and future archive contracts documented.
- [ ] Validation prevents traversal and ambiguous duplicate files.
- [ ] Fixtures/tests cover shape without pretending installation works.
- [ ] App-privileges warning and trusted same-context boundary explicit.

## Validation

Core validator tests (`pnpm --filter @thinkbrain/core test -- package`),
`pnpm lint`, `pnpm typecheck`; manual fixture inspection only.

## Non-goals

No archive extraction, install/uninstall UI, signing, URL/marketplace,
auto-update, native binary loading, or sandbox.

## References

- `extensions/extension_file_installation`; manifest parser shipped
  (story file deleted per plan-review policy).
