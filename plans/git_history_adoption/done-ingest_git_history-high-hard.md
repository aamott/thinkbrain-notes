# Ingest Git History

## Goal

Copy established Git history into the hidden repository without modifying or
depending permanently on its source.

## Acceptance Criteria

- A configured Git link imports every object reachable from its advertised
  default branch into a private source ref in the hidden repository.
- Without a Git link, a workspace-local `.git` is opened read-only and imported
  through the same object-copy path.
- When both sources share commits, object ids and displayed versions are not
  duplicated.
- Unrelated histories are retained under distinct source refs and are never
  silently grafted, rebased, pushed, or discarded.
- Removing network access or the local `.git` after import does not remove
  previously available versions.
- Invalid, shallow, missing-object, and unsupported-repository failures are
  reported with actionable errors and leave existing hidden history unchanged.
- Tests cover remote-only, local-only, matching dual-source, unrelated
  dual-source, and interrupted-import cases.

## Files

- `apps/desktop/src-tauri/src/commands/sync/bootstrap.rs`
- `apps/desktop/src-tauri/src/commands/sync/network.rs`
- `apps/desktop/src-tauri/src/commands/sync/hidden_repo.rs`
- `apps/desktop/src-tauri/src/commands/sync/round.rs`
