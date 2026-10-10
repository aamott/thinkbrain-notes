# Marketplace

> Extension discovery and installation. A future stub epic — not yet started.
> Read `plans/app-vision.md` before any work here. Explicitly deferred beyond
> the trusted-local beta; requires a separate trust/signing decision before
> remote discovery or installation is considered.

## Goal

Let users eventually discover, install, update, and manage extensions from a
static registry or direct file source — without compromising local-first,
privacy, and user-owns-their-data. Not a beta promise: URL install, remote
discovery, signing, marketplace, and strong isolation are deferred until a
separate trust decision. No proprietary cloud backend assumed.

## Scope

- Static extension registry (fetchable index; deferred).
- Marketplace / manager UI (browse, search, detail; deferred).
- Extension metadata and signed packages (needs a future trust decision).
- Update flow (check, update, rollback; deferred).

Non-goals: hosted cloud store, paid extensions/billing, curated
editorial/ratings/reviews, auto-update without consent.

## Architecture Decisions

- Builds on `extensions`: consumes its manifest, packaging, and trusted
  local/file-install decisions; does not redefine compatibility gates or
  lifecycle. Capabilities stay soft compatibility signals — any stronger
  trust/isolation model needs a new explicit decision.
- Boundary: `extensions` owns local-directory loading, manifest, gates,
  lifecycle, and later file install; `marketplace` may later own discovery,
  registry UX, update flow, signing/trust design.
- Registry = static fetchable index (JSON at a URL or Git-mirrored); no
  proprietary backend. Direct URL discovery/install deferred; file install
  is a later trusted-code flow.
- Signing is deferred and not a beta prerequisite; any scheme is reviewed
  alongside remote-code trust, not mistaken for a capability gate.
- Registry cache, installed-extension metadata, and update state live in OS
  app-data — never the vault.

## Dependencies

- **`extensions`** — must deliver the manifest, trusted local loading,
  lifecycle cleanup, and any approved file-install mechanism first. This
  epic cannot start without it.
- Desktop shell / native command bridge (done) — future fetch/install/verify
  commands.

## Status

- ⬜ `extension_registry` — fetchable index of available extensions.
- ⬜ `marketplace_ui` — browse, search, detail view.
- ⬜ `extension_metadata_signing` — manifest + signature verification.
- ⬜ `extension_update_flow` — check for updates, update, rollback.
