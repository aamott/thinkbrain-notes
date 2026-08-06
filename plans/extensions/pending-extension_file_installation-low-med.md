# Extension File Installation

## Status

⬜ Deferred beta follow-up. No archive extraction or install UI exists. Local-directory development loading is separate and should land first.

## Goal

Later, install an approved local extension package from a file into `<app_data>/extensions/<id>/`, after an explicit trusted-code/app-privileges warning and package validation. Keep install atomic, offline-capable, and independent of URL/marketplace discovery.

## Discovery questions

- Is ZIP the approved file type, and are drag/drop plus file-picker entry points both required?
- Is confirmation once per install, once per extension/version, or every activation?
- What happens on id/version conflict: replace, side-by-side, reject, or backup/rollback?
- Should install be desktop-only in beta, and how should mobile show unsupported behavior?
- Which package size, extraction time, symlink/native-binary, and disk-space limits are required?

**Stop-and-ask gate:** Do not implement archive extraction, installer UI, replacement policy, or warning copy until product/security answers these questions and approves the packaging contract. Never install code without the explicit app-privileges warning.

## Prerequisites

- Packaging contract and manifest parser.
- Local loader validation/reload semantics.
- Native app-data path conventions and Tauri dialog/file APIs.
- Product-approved settings/extensions UI entry point; UI work requires layout/accessibility sign-off before mockups/code.

## Exact likely file areas

- Rust extraction/atomic install module under `apps/desktop/src-tauri/src/commands/extensions.rs` plus `src/lib.rs`, `src/error.rs`, and capability definitions.
- Typed commands and adapter under `apps/desktop/src/native/commands.ts` / `src/native/extensions.ts`.
- UI entry point under `apps/desktop/src/extensions/` or existing Settings/Extensions panel after product approval; tests co-located.
- Installed root is OS app-data, never the workspace.

## Implementation tasks

1. Implement archive preflight validation using the packaging contract: size/path/symlink/duplicate/manifest/entry checks, with no partial writes.
2. Extract to a temporary app-data directory, validate the resulting directory, atomically move to `<app_data>/extensions/<id>/`, and clean temp files on failure.
3. Add install/uninstall status/result commands and preserve old version/rollback behavior per the approved conflict policy.
4. Add the explicit trusted-code warning/confirmation UI after layout approval; connect install completion to loader/bootstrap without duplicating runtime logic.
5. Test restart/discovery, malformed archive, extraction failure, duplicate id, conflict, cancellation, and cleanup.

## Acceptance criteria

- [ ] Only approved local package format is accepted and safely extracted.
- [ ] User sees and confirms that code runs with app privileges before installation.
- [ ] Install is atomic, outside the workspace, id/version validated, and recoverable on failure.
- [ ] Uninstall/deactivate cleanup follows the settings/data policy without affecting other extensions.
- [ ] URL install and marketplace are not reachable from this path.

## Automated validation

- Rust unit/integration tests with temporary directories and malicious archive fixtures.
- Desktop adapter/UI tests and E2E confirmation/cancel/install/uninstall flows.
- `pnpm test:rust`, `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Manual desktop/mobile checks

- Desktop Tauri: install valid package, cancel warning, reject malformed/traversal archive, restart, uninstall, and verify no vault changes.
- Mobile Tauri: verify unsupported/disabled UI or approved mobile picker path; no desktop-only command may be invoked unexpectedly.

## Non-goals

No URL install, registry/marketplace, signing, auto-update, hostile-code isolation, or feature implementation.

## Handoff artifacts

- Installer/extractor, threat/validation test fixtures, warning/UX decision, conflict/rollback policy, native command contract, and manual test report.

## References

- `plans/extensions/pending-extension_packaging_format-low-easy.md`
- `plans/extensions/pending-extension_deferred_distribution-low-med.md`
- `plans/extensions/pending-extension_settings-low-med.md`
