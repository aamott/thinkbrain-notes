# Deferred Extension URL and Marketplace Distribution

## Status

🚫 Explicitly deferred. Do not implement URL install, marketplace/discovery, signing, registry fetch, or auto-update as part of the beta extension platform.

## Goal

Preserve a clear boundary for future URL/marketplace work so local-directory development and later file installation do not accidentally grow remote distribution behavior. Record the prerequisites and questions needed before reopening the work.

## Discovery questions

- Is there a future static registry, Git-hosted index, or another discovery source; who operates it?
- Is signing/verification mandatory before any remote install, and which trust/root-key rotation model is acceptable?
- What privacy, telemetry, moderation, malware scanning, update, rollback, and offline-cache policies apply?
- Should URL install ever be supported on mobile, and what network/consent UI is required?
- How do ids, versions, dependencies, API compatibility, soft capability compatibility
  signals, and uninstall/rollback interact? Future distribution must describe
  capabilities only as soft compatibility signals, never as access grants; any
  installed code still requires a clear trusted app-privileges warning.

**Stop-and-ask gate:** Do not create endpoints, fetchers, marketplace screens, signing code, URL parsing, or remote install stubs until a separate product/security decision approves the threat model, trust model, registry, and UX. A “temporary” URL path violates the current scope.

## Prerequisites before reopening

- Stable manifest/parser and API version contract.
- Stable package/archive validation and local file install flow.
- Approved native secret/network/consent boundaries.
- Separate marketplace epic/technical decision; existing `plans/marketplace/` files remain planning references only.

## Exact likely file areas (future only)

- Future marketplace UI under `apps/desktop/src/` after product/layout approval.
- Future network/native adapter under `apps/desktop/src/native/` and Rust commands under `apps/desktop/src-tauri/src/` after security approval.
- Future static registry/cache models likely in `packages/core/src/extensions/` and OS app-data adapters; no files should be added now.

## Implementation tasks when reopened

1. Write and approve threat/trust/privacy/update decisions and registry/package schema.
2. Design desktop/mobile browse/search/detail/install/update/rollback UX; ask product/layout questions before mockups or code.
3. Implement signed metadata verification and offline cache before any remote code download.
4. Add a remote installer that reuses local package validation and atomic install; keep app-privileges warning explicit.
5. Add end-to-end offline/error/signature/rollback/update tests and manual checks that
   compatibility warnings are soft, no capability is presented as an access grant,
   and trusted app privileges are shown before install.

## Acceptance criteria for this deferral

- [ ] Parent extension epic and marketplace references explicitly say this work is deferred.
- [ ] No URL/registry/network install code or UI is present in the beta stories.
- [ ] Future questions, prerequisites, and handoff boundary are documented.
- [ ] Local file installation remains independent of remote discovery.

## Automated validation

- Repository search confirms no new URL/marketplace installer symbols or native commands were introduced by extension-platform work.
- Existing lint/typecheck/build remain unaffected.

## Manual desktop/mobile checks

- Desktop: verify the Extensions surface remains unavailable or local-only and does not offer a URL/marketplace action.
- Mobile: verify no remote extension discovery/install action is shown and offline startup remains unaffected.

## Non-goals

All remote discovery, URL install, marketplace UI/backend, signing, verification, auto-update, telemetry, moderation, dependency resolution, and remote code execution.

## Handoff artifacts

- Deferred decision record, reopen checklist, future threat-model questions, and references to marketplace planning without implementation claims.

## References

- `plans/pending-marketplace-low-med.md`
- `plans/marketplace/pending-extension_registry-low-med.md`
- `plans/marketplace/pending-extension_metadata_signing-low-hard.md`
- `plans/marketplace/pending-extension_update_flow-low-med.md`
- `plans/extensions/pending-extension_file_installation-low-med.md`
