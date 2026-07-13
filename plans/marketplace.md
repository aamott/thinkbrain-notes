# Marketplace

> Extension discovery and installation. A future stub epic — not yet started.
> Read `plans/app-vision.md` before any work here. This epic cannot start until
> the `extensions` epic delivers the capability sandbox and install mechanism.

## Goal

Let users discover, install, update, and manage extensions from a static
registry or direct URL/file sources — without compromising the local-first,
privacy, and user-owns-their-data principles. No proprietary cloud backend:
the registry is a static, fetchable index, and direct install (URL/file) is
always available as a fallback.

## Scope

In scope:

- static extension registry (fetchable index of available extensions)
- extension marketplace / manager UI (browse, search, detail view)
- extension metadata and signed packages
- extension update flow (check for updates, update, rollback)

Install from URL/file and the install mechanism itself are owned by the
`extensions` epic. This epic consumes that mechanism for registry-driven
discovery and updates.

Non-goals (out of scope):

- hosted cloud marketplace backend or vendor-controlled store
- paid extensions / billing / licensing
- curated editorial features, ratings, reviews (may follow much later)
- auto-updating extensions without user consent

## Architecture Decisions

### Builds on the `extensions` epic

This epic is a consumer of the `extensions` epic's capability sandbox and
install mechanism. It does not redefine sandboxing, manifest format, or
permission declarations — those are owned by `extensions`. Marketplace work
must not weaken the capability sandbox or introduce unrestricted filesystem
access (per AGENTS.md and the security principle in the archived
`extensions.md`: no third-party code receives unrestricted filesystem access).

### Boundary with `extensions`

Resolved split:

- `extensions` owns the install *mechanism*, sandbox, manifest format,
  permission enforcement, install-from-URL, and install-from-file.
- `marketplace` owns discovery, the registry *UX*, the update flow, and the
  signing/trust layer.

### Static registry, not a hosted store

The registry is a static, fetchable index (e.g. a JSON manifest hosted at a
URL or mirrored via Git). No proprietary cloud backend. This matches the
"bring your own sync" / no-vendor-lock-in principles. Direct install from URL
or local file is always available alongside the registry, so users are never
forced through a single source.

### Signing and metadata

Installed extensions carry metadata (manifest fields from `extensions`) plus a
signature for integrity verification. Signature scheme is to be designed when
this epic starts; it must be compatible with the `extensions` sandbox and must
not require a centralized authority for direct (URL/file) installs.

### User-data separation

Registry cache, installed-extension metadata, and update state live in OS
app-data — never in the vault. The vault stays Markdown + attachments only.

## Dependencies

- **`extensions` (prerequisite, not yet started)** — must deliver the
  capability sandbox, `extension.json` manifest, install mechanism, and
  permission declarations before this epic can implement anything. This epic
  is blocked until `extensions` is in place.
- desktop shell / native command bridge (done) — Tauri native commands for
  fetch/install/verify operations.

No other epic blocks this one, but it cannot start without `extensions`.

## Status

- ⬜ Static extension registry — fetchable index of available extensions
- ⬜ Marketplace / extension manager UI — browse, search, detail view
- ⬜ Extension metadata and signing — manifest + signature verification
- ⬜ Extension update flow — check for updates, update, rollback
