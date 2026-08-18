- name: registry lifecycle and sweeper logic have no tests
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/registry.rs
- lines: 183-238
- description: The test module (183-238) only tests `changed_paths` (the pure helper). The concurrency-critical and behavior-critical functions — `attach`, `detach`, `release_window`, `note_changes`, and `spawn_sweeper` — have no tests at all. This is the highest-risk module in the sync feature (global mutable state, a background thread, lock-held-during-bootstrap, drop-without-flush) and it's the least tested.

  The lack of tests is partly understandable — the global `static ENGINES` mutex makes the functions hard to test in isolation (tests would interfere with each other and with the sweeper thread). But that itself is a smell: the registry is a process-global singleton with no test seam. Introducing a `Registry` struct that can be constructed in a test (owning its own `Mutex<Option<Registry>>` or taking an `Arc<Mutex<Option<Registry>>>`) would make `attach`/`detach`/`release_window` testable without polluting the global. The `WatchInterest` type from watcher.rs is already a struct that's testable in isolation — the registry should follow the same pattern.

  Minimum viable test coverage to add:
  - `attach` then `detach` removes the engine; a second `attach` re-bootstraps.
  - Two `attach`es with different labels share one engine (refcount).
  - `release_window` drops all interest for that label.
  - `note_changes` after `detach` is a no-op (no engine).
  - The sweeper records a settled change within ~`TICK` + `SETTLE`.

  The sweeper test requires either a real sleep or an injectable clock; given the existing `Instant`-based design, a real sleep of `TICK + SETTLE + slack` is acceptable for one integration-style test.
- verification: Read of test module (183-238); confirmed only `changed_paths` is tested. No `#[test]` references `attach`, `detach`, `release_window`, `note_changes`, or `spawn_sweeper`.
