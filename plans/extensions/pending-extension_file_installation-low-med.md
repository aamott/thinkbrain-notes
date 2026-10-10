# Extension File Installation

## Status

⬜ Deferred beta follow-up. No archive extraction or install UI exists.
Local-directory development loading is separate and shipped.

## Goal

Later, install an approved local package file into
`<app_data>/extensions/<id>/` after an explicit trusted-code/app-privileges
warning and package validation. Atomic, offline-capable, independent of
URL/marketplace discovery.

## Discovery questions (stop-and-ask gate)

Is ZIP the approved type; drag/drop + file-picker entry points both required?
Confirmation once per install, per extension/version, or every activation?
Id/version conflict: replace, side-by-side, reject, backup/rollback?
Desktop-only in beta; how does mobile show unsupported? Package size,
extraction time, symlink/native-binary, and disk-space limits?

Do not implement extraction, installer UI, replacement policy, or warning
copy until product/security approve the packaging contract. Never install
code without the explicit app-privileges warning.

## Prerequisites

- `extension_packaging_format` contract + manifest parser; local loader
  validation/reload semantics; native app-data path conventions; Tauri
  dialog/file APIs; product-approved settings/extensions UI entry point.

## Likely files

- Rust extraction/atomic install under
  `apps/desktop/src-tauri/src/commands/extensions.rs` + typed commands under
  `apps/desktop/src/native/`; UI entry under `apps/desktop/src/extensions/`
  or Settings after approval. Installed root is OS app-data, never the vault.

## Acceptance criteria

- [ ] Only the approved package format accepted and safely extracted
      (size/path/symlink/duplicate/manifest/entry preflight; temp-dir extract,
      atomic move, temp cleanup on failure).
- [ ] User confirms code runs with app privileges before installation.
- [ ] Install atomic, outside the workspace, id/version validated,
      recoverable on failure.
- [ ] Uninstall/deactivate cleanup follows the settings/data policy without
      affecting other extensions.
- [ ] URL install and marketplace unreachable from this path.

## Validation

Rust tests with temp dirs and malicious archive fixtures; adapter/UI tests
and E2E confirm/cancel/install/uninstall; `pnpm test:rust`, `pnpm test`,
`pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Non-goals

No URL install, registry/marketplace, signing, auto-update, hostile-code
isolation, or feature implementation.

## References

- `extensions/extension_packaging_format`,
  `extensions/extension_deferred_distribution`,
  `extensions/extension_settings`
