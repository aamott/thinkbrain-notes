- name: `WATCHERS` and `SELF_WRITES` use `Mutex::lock().unwrap()` — panics on poison, inconsistent with the rest of the backend
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/watcher.rs
- lines: 311, 337, 474, 496, 513
- description: The watcher module locks its mutexes with `.lock().unwrap()` (lines 311, 337, 474, 496, 513) which panics on a poisoned mutex. Every other module in the backend uses the `.unwrap_or_else(|poisoned| poisoned.into_inner())` pattern (settings.rs:104-105, workspace.rs:35-37, git.rs:269-271, etc.) — explicitly to keep serving after a panic in a locked critical section. The watcher is inconsistent and will crash the whole app if any watcher callback panics, even though the watcher is non-critical (the frontend can rebuild the index from disk).

  `search.rs` has the same issue at lines 29, 33, 98, 119, 149, 172, 191 — `.lock().unwrap()` on `SEARCH_CONNECTIONS` and on the per-connection `Arc<Mutex<Connection>>`. A panic in one search command would poison the connection mutex and crash every subsequent search in any window.

  Recommend: replace all `.lock().unwrap()` in watcher.rs and search.rs with `.lock().unwrap_or_else(|poisoned| poisoned.into_inner())` to match the rest of the backend. For `search.rs` this is a one-line `use` of a small helper or just the inline expression.
- verification: grepped `\.unwrap\(\)` in `src-tauri/src` — 7 matches in search.rs (lines 29, 33, 98, 119, 149, 172, 191) and 5 in watcher.rs (311, 337, 474, 496, 513), all `Mutex::lock().unwrap()`. Compared to settings.rs:104, workspace.rs:36, git.rs:270 which all use `unwrap_or_else(|poisoned| poisoned.into_inner())`.
