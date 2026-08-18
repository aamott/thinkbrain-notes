- name: watcher releases its debouncer before registry::detach, so a detach flush would read files no longer being watched
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/watcher.rs
- lines: 504-517 (unwatch_workspace), 524-534 (release_window_watchers), cross-ref registry.rs 77-93
- description: |
    `unwatch_workspace` (watcher.rs 504-517) and `release_window_watchers`
    (524-534) both tear down the watcher *before* calling
    `registry::detach` / `registry::release_window`:
    - `unwatch_workspace`: `state.debouncers.remove(&canonical_root)` at
      line 512 (drops the debouncer, stopping its OS file handle) *then*
      `registry::detach(...)` at line 515.
    - `release_window_watchers`: `state.debouncers.remove(&root)` at line
      530 *then* `registry::release_window(label)` at line 533.

    This ordering is currently harmless because `registry::detach` only
    removes the engine from the map (registry.rs 77-84) — it does not read
    the vault. But the proposed fix for
    `registry-detach-drops-unsettled-edits,hard,high.md` adds an
    `engine.flush()` call to `detach`/`release_window` that *does* read the
    vault (via `snapshot::build_tree` → `std::fs::symlink_metadata` and
    `File::open`, snapshot.rs 115-130). At the moment that flush runs, the
    OS file watcher for that workspace has already been dropped, so any
    change arriving between the debouncer drop and the flush read is
    invisible to both the watcher (gone) and the flush (already past its
    `take_settled` drain). That change is lost from history.

    The window is tiny (microseconds between the two calls in the same
    thread) and the lost change would have had to arrive in that exact
    window, so this is low probability. But it is a real ordering
    dependency introduced by the flush fix. Two ways to address it:
    1. **Reorder**: call `registry::detach`/`release_window` *before*
       dropping the debouncer, so the flush reads while the watcher is
       still active (any change the flush misses will be picked up by the
       watcher — but the watcher is about to be dropped too, so this just
       moves the window). Not a real fix.
    2. **Accept the micro-window**: the flush's purpose is to capture
       edits that already settled in pending; an edit arriving in the
       microsecond gap between debouncer drop and flush read is an
       extreme edge case. Document it and move on. This is probably the
       right call given the probability, but the dependency should be
       recorded so a future refactor of the teardown order doesn't
       silently widen the window.

    Filing as a cross-file finding because the fix lives in registry.rs
    but the ordering constraint lives in watcher.rs, and neither file
    alone reveals the interaction.
- verification: |
    Read `unwatch_workspace` (watcher.rs 504-517): confirmed
    `debouncers.remove` (512) precedes `registry::detach` (515). Read
    `release_window_watchers` (524-534): confirmed `debouncers.remove`
    (530) precedes `registry::release_window` (533). Read
    `registry::detach` (77-84): confirmed no vault read today. Read
    `snapshot::build_tree` (97-150): confirmed it reads the vault via
    `symlink_metadata` and `File::open`, which the proposed flush would
    invoke.
