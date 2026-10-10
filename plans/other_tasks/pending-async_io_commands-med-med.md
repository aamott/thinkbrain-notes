# Story: Move blocking I/O commands off the sync IPC path

All Tauri commands are synchronous `fn`s; `index_documents`, `sync_now`
(network I/O), `list_workspace_entries` on large vaults block the IPC/main
path. The codebase already threaded the sync bootstrap specifically to dodge
a Windows AppHang — the same hazard applies to every heavy command
(`docs/reviews/2026-10-10/architecture-native-backend-med-hard.md` #3).

## Acceptance

- [ ] Audit commands for filesystem/network work; convert the heavy ones to
      `async` + `spawn_blocking` (or background-thread + event, where a
      progress stream already exists).
- [ ] `sync_now` and index/build commands no longer run on the main path.
- [ ] No new races: anything touching per-workspace state re-checks after
      the yield.
