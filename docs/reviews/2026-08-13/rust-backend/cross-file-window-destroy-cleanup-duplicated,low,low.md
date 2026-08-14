- name: Cross-file: window-destroy watcher cleanup is registered in two places (lib.rs setup + workspace.rs open_workspace_window) with no shared helper
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/lib.rs
- lines: lib.rs:46-53; workspace.rs:358-368
- description: Two places attach a `WindowEvent::Destroyed` handler that calls `crate::commands::watcher::release_window_watchers(&label)`:
  1. `lib.rs:46-53` — for the initial window declared in `tauri.conf.json` (exists before any command runs).
  2. `workspace.rs:358-368` — for each window opened via `open_workspace_window`.

  The lib.rs handler does *only* `release_window_watchers`. The workspace.rs handler does `unregister_workspace_window_root` *and* `release_window_watchers`. So:
  - The initial window (from `tauri.conf.json`) never has its root unregistered, because it was never *registered* (it's the main window, not a workspace window — `WorkspaceWindowRoots` is only populated by `open_workspace_window`). That's correct: the main window's `window_workspace_root` returns `None` and the frontend treats it as the primary shell. But it means the lib.rs destroy handler is doing only the watcher half, while the workspace.rs handler is doing both halves — the two handlers are not interchangeable, which is fine but non-obvious.
  - The two closures are near-duplicates: both `move |event| { if matches!(event, tauri::WindowEvent::Destroyed) { ... } }`. A `pub fn on_window_destroyed(label: String, app: tauri::AppHandle)` helper in `watcher.rs` (or a small `attach_destroy_cleanup(window, app, is_workspace_window: bool)` in `workspace.rs`) would make the two call sites one line each and centralize the "what happens when a window dies" policy. Today the policy is split across lib.rs and workspace.rs and a reader has to find both to know the full cleanup.

  Low urgency — the current code is correct — but the policy should live in one place. The `release_window_watchers` function in watcher.rs:512-520 is already the right home; adding a thin `attach_window_destroy_handler(window, app)` that registers the closure would let both lib.rs and workspace.rs call it.
- verification: read lib.rs:46-53 and workspace.rs:358-368; both attach a `Destroyed` handler, lib.rs calls only `release_window_watchers`, workspace.rs calls `unregister_workspace_window_root` + `release_window_watchers`.
