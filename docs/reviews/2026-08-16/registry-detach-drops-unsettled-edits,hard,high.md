- name: detach/release_window drop engines without flushing unsettled edits
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/registry.rs
- lines: 77-93
- description: `detach` (77-84) and `release_window` (87-93) remove the engine from the map when the last window interest is released. The `Arc<Engine>` is dropped if no other reference (e.g., an in-flight sweeper call) holds it. Dropping the engine drops its `PendingChanges`, and any edit that was noted but not yet settled (last edit < `SETTLE` = 3 seconds ago) is silently discarded — never recorded into history.

  This directly contradicts the feature's stated promise in engine.rs (lines 19-23): "short enough that a user who edits and immediately closes the app does not lose the record of it." A user who edits a note and closes the window within 3 seconds loses the edit from history. The `SETTLE` window exists to debounce bursts, but closing the window should *flush*, not *cancel*, the pending set.

  Suggested fix: add an `Engine::flush(&self) -> Result<Option<gix::ObjectId>, NativeError>` that records *all* pending paths regardless of settle time (or equivalently, calls `take_settled` with `settle = Duration::ZERO`). In `detach` and `release_window`, when `interest.release(...)` returns true (last interest gone), call `engine.flush()` before removing the engine from the map. Errors from `flush` should be logged (same `eprintln!` pattern as the sweeper, lines 115/176) since there's no caller to return them to.

  This is high urgency because it's a data-loss path that contradicts the feature's own design rationale and is reachable by ordinary user behavior (edit then close).
- verification: Read of `detach` (77-84) and `release_window` (87-93); confirmed neither calls any flush before `engines.remove`. `Engine::record_settled` (engine.rs 55-70) only drains paths older than `SETTLE`. The promise is quoted from engine.rs lines 19-23.
