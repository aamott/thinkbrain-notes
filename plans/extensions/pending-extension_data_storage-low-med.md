# Extension-Owned App-Data Storage

## Status

⬜ Focused child story. Extension data storage is not implemented; secrets remain exclusively owned by the separate native secret-storage story.

## Goal

Provide an extension-scoped, app-data storage adapter for approved JSON/blob values with traversal protection, quotas, atomic writes, and lifecycle-aware cleanup. It never writes to the workspace and never stores credentials.

## Discovery questions and STOP gate

- Which value types, quotas, retention, migration, and uninstall cleanup policy are approved?
- Is storage one JSON namespace, files/blobs, or both, and what atomicity guarantees are required?
- Which desktop/mobile app-data locations and unavailable behavior are supported?

**STOP gate:** Do not commit a storage schema, cleanup UX, or implement native file operations until owners answer these questions and approve the app-data/retention policy. Do not use this story for secrets.

## Dependencies

- Canonical extension ID, lifecycle/bootstrap, compatibility, and native app-data conventions.
- `pending-extension_api_surface-low-hard.md` rollup and settings story for separation of non-secret settings.
- Secret storage remains owned by `pending-extension_secret_storage-med-hard.md`.

## Likely files

- `packages/core/src/extensions/storage.ts` and tests for platform-neutral contracts.
- `apps/desktop/src/extensions/` storage facade/tests.
- `apps/desktop/src/native/` and `src-tauri/src/commands/` only if an approved app-data adapter is needed.

## Small task sequence

1. Record value/quota/path/retention and uninstall decisions.
2. Define scoped typed storage interfaces and reject traversal/cross-extension paths.
3. Implement fake and approved native adapters with atomic bounded writes.
4. Integrate disposable cleanup and test corrupt/unavailable/quota cases.

## Acceptance criteria

- [ ] Data is rooted in OS app-data under the canonical extension namespace, never the workspace.
- [ ] Traversal, cross-extension access, oversized/corrupt values, and unsupported platforms fail with typed diagnostics.
- [ ] Writes are atomic/bounded and cleanup follows the approved uninstall policy without touching secrets or other extensions.
- [ ] No bulk secret/list-all credential API is introduced.

## Automated validation

Run focused core/desktop storage tests, fake/native error tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Manual desktop/mobile checks

Desktop: write/read/delete fixture data, inspect app-data versus workspace, exceed quota, and simulate interruption. Mobile: verify approved app-data behavior, suspension/restart recovery, storage limits, and explicit unavailable state.

## Non-goals

No secret storage, settings UI, installer, marketplace, sandbox, workspace cache, Git/AI/journal behavior, or cross-extension messaging.

## Handoff expectations

Deliver storage contract, path/quota/retention decision, fake/native tests, cleanup report, migration notes, and unresolved platform questions. Keep implementation paths labeled likely.

## References

- `plans/extensions/pending-extension_api_surface-low-hard.md`
- `plans/extensions/pending-extension_secret_storage-med-hard.md`
- `plans/extensions/pending-extension_settings-low-med.md`
