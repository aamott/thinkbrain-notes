# Marketplace

> Extension discovery and installation. A future stub epic — not yet started.
> Read `plans/app-vision.md` before any work here. This epic is explicitly
> deferred beyond the trusted-local beta; it requires a separate trust/signing
> decision before remote discovery or installation is considered.

## Goal

Let users eventually discover, install, update, and manage extensions from a
static registry or direct file source — without compromising the local-first,
privacy, and user-owns-their-data principles. This is not a beta promise:
install-from-URL, remote discovery, signing, marketplace, and strong isolation
are deferred until a separate trust decision. No proprietary cloud backend is
assumed.

## Scope

In scope:

- static extension registry (fetchable index of available extensions; deferred)
- extension marketplace / manager UI (browse, search, detail view; deferred)
- extension metadata and signed packages (requires a future trust decision)
- extension update flow (check for updates, update, rollback; deferred)

The `extensions` epic owns trusted local-directory loading and may later own
file installation. URL installation, remote discovery, signing, and marketplace
UX are not available in the beta and must not be treated as existing mechanisms.

Non-goals (out of scope):

- hosted cloud marketplace backend or vendor-controlled store
- paid extensions / billing / licensing
- curated editorial features, ratings, reviews (may follow much later)
- auto-updating extensions without user consent

## Architecture Decisions

### Builds on the `extensions` epic

This epic is a future consumer of the `extensions` epic's manifest and trusted
local/file-install decisions. It does not redefine compatibility gates, manifest
format, or lifecycle ownership. Marketplace work must not imply that soft
capability declarations provide hostile-extension isolation; any stronger trust
or isolation model requires a new explicit decision.

### Boundary with `extensions`

Resolved split:

- `extensions` owns trusted local-directory loading, the manifest format,
  compatibility gates, lifecycle cleanup, and any later install-from-file flow.
- `marketplace` may later own discovery, registry UX, update flow, and signing /
  trust design; none is a beta prerequisite.

### Static registry, not a hosted store

A future registry may be a static, fetchable index (e.g. a JSON manifest
hosted at a URL or mirrored via Git). No proprietary cloud backend is assumed.
Direct URL discovery/install is explicitly deferred; local file install is a
later trusted-code flow, not a beta guarantee.

### Signing and metadata

A future marketplace may add signatures and metadata, but signing is deferred
and not required by the trusted-local beta. Any signature scheme must be
reviewed alongside remote-code trust and stronger isolation rather than being
mistaken for a capability gate.

### User-data separation

Registry cache, installed-extension metadata, and update state live in OS
app-data — never in the vault. The vault stays Markdown + attachments only.

## Dependencies

- **`extensions` (prerequisite, not yet started)** — must deliver the
  `extension.json` manifest, trusted local loading, lifecycle cleanup, and any
  approved file-install mechanism before this epic can implement anything.
  This epic remains deferred beyond the beta.
- desktop shell / native command bridge (done) — future native commands for
  fetch/install/verify operations.

No other epic blocks this one, but it cannot start without `extensions`.

## Status

- ⬜ Static extension registry — fetchable index of available extensions
- ⬜ Marketplace / extension manager UI — browse, search, detail view
- ⬜ Extension metadata and signing — manifest + signature verification
- ⬜ Extension update flow — check for updates, update, rollback
