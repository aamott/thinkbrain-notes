# Static Extension Registry

## Goal

Provide a fetchable static index of available extensions (e.g. a JSON manifest
hosted at a URL or mirrored via Git) that the marketplace UI can browse. No
hosted cloud backend — the registry is static data the app fetches and caches
in OS app-data.

## Acceptance Criteria

- App can fetch a registry index from a configurable URL.
- Registry is cached locally in OS app-data (never in the vault) with a
  last-fetched timestamp.
- Cache is refreshable on demand and degrades gracefully offline (last-good
  cache is used when the fetch fails).
- Index entries expose the fields needed by the marketplace UI (id, name,
  description, version, author, download URL, signature ref).
- No proprietary cloud backend; direct URL/file install remains available
  independent of the registry.

## References

- `plans/pending-marketplace-low-med.md`
- Prerequisite: `plans/pending-extensions-low-hard.md` (manifest format, capability sandbox)
