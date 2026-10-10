# Deferred Extension URL and Marketplace Distribution

## Status

🚫 Explicitly deferred. Do not implement URL install, marketplace/discovery,
signing, registry fetch, or auto-update in the beta extension platform.

## Goal

Keep a clear boundary so local-directory development and later file
installation cannot grow remote distribution by accident; record what a
reopening requires.

## Discovery questions for a future reopening

- Static registry, Git-hosted index, or other discovery source — and who
  operates it?
- Is signing/verification mandatory before any remote install; which
  trust/root-key rotation model is acceptable?
- Privacy, telemetry, moderation, malware scanning, update, rollback,
  offline-cache policies?
- URL install on mobile — network/consent UI?
- How do ids, versions, dependencies, apiVersion, and soft capability signals
  interact? Capabilities stay compatibility hints, never access grants;
  installed code always needs the explicit app-privileges warning.

**Stop-and-ask gate:** no endpoints, fetchers, marketplace screens, signing
code, URL parsing, or remote-install stubs until a separate product/security
decision approves the threat model, trust model, registry, and UX.

## Prerequisites before reopening

- Stable manifest/parser and apiVersion contract; stable package validation
  and local file-install flow; approved secret/network/consent boundaries.
- A separate marketplace epic/trust decision; `plans/marketplace/` files are
  planning references only.

## Acceptance criteria for this deferral

- [x] Parent extension epic and marketplace references say this is deferred.
- [ ] No URL/registry/network install code or UI in beta stories.
- [x] Future questions, prerequisites, and handoff boundary documented (here).
- [ ] Local file installation stays independent of remote discovery.

## Validation when reopened

Repo search must find no URL/marketplace installer symbols; signed-metadata
verification and offline cache land before any remote download; reuse local
package validation and keep the app-privileges warning explicit.

## Non-goals

All remote discovery, URL install, marketplace UI/backend, signing,
verification, auto-update, telemetry, moderation, dependency resolution,
remote code execution.

## References

- `plans/marketplace/` stories: `extension_registry`,
  `extension_metadata_signing`, `extension_update_flow`
- `extensions/extension_file_installation`
