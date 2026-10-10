# Extension-Owned App-Data Storage

## Status

⬜ Focused child story. Extension data storage is not implemented; secrets
remain exclusively owned by `extension_secret_storage`.

## Goal

Extension-scoped, app-data storage adapter for approved JSON/blob values with
traversal protection, quotas, atomic writes, and lifecycle-aware cleanup.
Never writes to the workspace, never stores credentials.

## Discovery questions (STOP gate)

Which value types, quotas, retention, migration, and uninstall cleanup policy
are approved? Is storage one JSON namespace, files/blobs, or both, and what
atomicity is required? Which desktop/mobile app-data locations and
unavailable behavior are supported?

Do not commit a storage schema, cleanup UX, or native file operations until
owners approve the app-data/retention policy.

## Dependencies

- Canonical extension id, lifecycle/bootstrap, compatibility, native app-data
  conventions.
- `extension_settings` for the non-secret settings boundary;
  `extension_secret_storage` owns secrets.

## Likely files

- `packages/core/src/extensions/storage.ts` + tests (platform-neutral contracts).
- `apps/desktop/src/extensions/` storage facade/tests; `native/` and
  `src-tauri/` only if an approved adapter is needed.

## Acceptance criteria

- [ ] Data rooted in OS app-data under the canonical extension namespace,
      never the workspace.
- [ ] Traversal, cross-extension access, oversized/corrupt values, and
      unsupported platforms fail with typed diagnostics.
- [ ] Writes atomic/bounded; cleanup follows the approved uninstall policy
      without touching secrets or other extensions.
- [ ] No bulk secret/list-all credential API.

## Validation

Focused core/desktop storage tests incl. corrupt/unavailable/quota cases,
`pnpm lint`, `pnpm typecheck`, `pnpm build`; manual desktop/mobile
write/read/delete, quota, and interruption checks.

## Non-goals

No secret storage, settings UI, installer, marketplace, sandbox, workspace
cache, Git/AI/journal behavior, or cross-extension messaging.
