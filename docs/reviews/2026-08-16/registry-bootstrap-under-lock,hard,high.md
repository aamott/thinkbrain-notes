- name: attach bootstraps the workspace while holding the global registry lock
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/registry.rs
- lines: 49-75
- description: `attach` acquires the registry mutex (line 55) and calls `bootstrap(app_data_dir, root)` (line 59) *inside* the lock. `bootstrap` (bootstrap.rs lines 72-93) does substantial filesystem I/O: it checks for `.git`, opens or creates the hidden repository, writes the `info/exclude` file, and — on a first open of an existing vault — calls `recordable_notes(vault)` which walks the *entire* vault (bootstrap.rs line 83 → `collect` lines 134-180), then `snapshot::record` over every note found. For a vault of 10,000 notes this is potentially seconds of work.

  While `attach` holds the global `ENGINES` lock, *every other workspace's* `attach`, `detach`, `release_window`, and `note_changes` is blocked (all acquire the same mutex via `registry()`, lines 40-42). So opening workspace B while workspace A is being bootstrapped for the first time blocks B's open UI until A's full-vault walk completes. The sweeper thread (line 161) also takes the lock every 500ms and would be blocked for the duration, delaying recording for all other workspaces.

  Suggested fix: bootstrap *outside* the lock with a double-checked insertion:
  1. Acquire lock, check `engines.contains_key(key)`. If present, just `acquire` interest and return. If not, drop the lock.
  2. Run `bootstrap` outside the lock.
  3. Re-acquire the lock. Re-check `engines.contains_key(key)` — another thread may have bootstrapped the same key concurrently. If still absent, insert the engine. If present, discard the newly-bootstrapped engine and use the existing one (see the separate "attach race" finding for the lost-edit consequence).
  4. `acquire` interest and ensure the sweeper is running.

  This is the highest-urgency finding because it's a user-visible scalability cliff (multi-workspace users) and the fix interacts with the concurrent-attach race, so both should be designed together.
- verification: Read of `attach` (49-75) and `bootstrap` (bootstrap.rs 72-93, `collect` 134-180). Confirmed `registry()` returns a guard over the single global `ENGINES` mutex (38-42) used by all four entry points.
