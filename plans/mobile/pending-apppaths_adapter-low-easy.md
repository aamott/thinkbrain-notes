# Mobile AppPaths Adapter

## Goal

Implement the mobile `AppPathsAdapter` to resolve OS app-data directories for
settings, index cache, and other app-owned data. Enforces the user-data
separation rule: app data never lives inside the workspace/vault.

## Acceptance Criteria

- [ ] `AppPathsAdapter` implementation lives in `apps/mobile/src/adapters/`.
- [ ] Implements the `AppPathsAdapter` interface from `packages/core`.
- [ ] Resolves app-data directory for settings, index cache, and per-workspace
      data.
- [ ] Per-workspace subdirectories keyed by stable workspace identity (mirrors
      desktop).
- [ ] No app data is written inside the user's workspace.

## References

- `plans/technical-decisions.md` — Settings, Database and Indexes sections
- `apps/desktop/src-tauri/src/lib.rs` — `resolve_index_db_path` (reference)
- `plans/mobile.md` — Platform adapter contract
- `plans/app-vision.md` — User data separation
