- name: record_settled can fork history if called concurrently
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/engine.rs
- lines: 55-70
- description: `record_settled` drains `take_settled` under the `pending` lock (lines 56-59), then releases the lock and calls `snapshot::record` (line 69) outside the lock. Two concurrent callers can both drain disjoint (or, with timing, even overlapping-after-replenishment) settled sets and both proceed to `snapshot::record` on the same `ThreadSafeRepository`. gix's `commit_as` writes the new commit and updates the ref; with the default loose-ref backend it does not perform a compare-and-swap against the parent it read, so the second commit creates a fork — two commits sharing the same parent, neither a child of the other. The history branch (`refs/heads/main`) ends up pointing at whichever wrote last, orphaning the other commit's changes from the linear history the feature promises.

  Today the only caller is the single sweeper thread in registry.rs (line 174), so the race is latent. But `record_settled` is `pub` and the module doc comment (lines 1-6) explicitly invites other callers ("the watcher feeds it, and its own tests feed it the same way"), and story 5 (status surface) or a manual "sync now" command could call it from a window thread.

  Two fixes, in order of preference:
  1. **Serialize commits**: add a `recording: Mutex<()>` field to `Engine` and hold its guard across the `snapshot::record` call (after releasing the `pending` guard). This keeps pending-note ingestion concurrent with recording but makes recording itself mutually exclusive — exactly the property git commits require.
  2. **Document the constraint**: add a `# Concurrency` doc paragraph stating `record_settled` must be called from a single thread per engine (e.g., only the sweeper). Cheaper but fragile — the next caller has to read the docs.

  Also add a test that spawns two threads calling `record_settled` on the same engine with different settled paths and asserts the resulting history is linear (one commit is the parent of the other). The existing `an_engine_can_be_used_from_several_threads` test (lines 217-241) only exercises concurrent `note_changes` and gives false confidence about `record_settled` safety.
- verification: Read of `record_settled` (55-70); confirmed the `pending` lock is dropped before `snapshot::record`. Cross-checked gix `commit_as` behavior (no CAS on parent ref). The existing concurrency test (217-241) only tests `note_changes`.
