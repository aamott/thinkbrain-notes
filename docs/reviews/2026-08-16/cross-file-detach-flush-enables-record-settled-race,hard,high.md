- name: fixing detach-drops-unsettled-edits makes the engine record_settled race reachable
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/sync/registry.rs
- lines: 77-93 (detach/release_window), cross-ref engine.rs 55-70 (record_settled), snapshot.rs 52-66 (record)
- description: |
    Two findings filed separately combine into a single cross-file hazard that
    raises the urgency of both:

    1. `registry-detach-drops-unsettled-edits,hard,high.md` proposes that
       `detach`/`release_window` call `engine.flush()` (a record-all-pending
       variant of `record_settled`) before removing the engine, so closing a
       window does not discard edits that have not yet settled.
    2. `engine-record-settled-race,hard,med.md` notes that `record_settled`
       drains pending under the `pending` lock but calls `snapshot::record`
       *outside* that lock, so two concurrent `record_settled` calls on the
       same engine can both commit and fork the history branch.

    Today (2) is latent because the sweeper is the only `record_settled`
    caller. But the fix for (1) introduces a *second* caller: a window's
    `unwatch_workspace` → `registry::detach` → `engine.flush` →
    `snapshot::record` running on the window's command thread, concurrent
    with the sweeper's periodic `record_settled` → `snapshot::record` on the
    sweeper thread. The race becomes not just reachable but common: any
    workspace close that happens to coincide with a sweeper tick (500ms
    granularity) can fork history.

    Therefore the two fixes must be implemented together:
    - Add `Engine::recording: Mutex<()>` (or a `Mutex<()>
      recording_lock`) and hold it across the `snapshot::record` call in
      *both* `record_settled` and the new `flush`, after releasing the
      `pending` lock. This serializes commits on a per-engine basis while
      keeping pending ingestion concurrent.
    - Only then add the `flush` call to `detach`/`release_window`.

    Implementing (1) without (2) turns a latent concurrency bug into a
    user-reachable history-forking bug. Implementing (2) without (1) leaves
    the data-loss-on-close bug in place. The engine concurrency test called
    for in `engine-record-settled-race` should be extended to cover the
    sweeper-vs-flush case specifically.
- verification: |
    Read `registry::detach` (77-84) and `release_window` (87-93): confirmed
    no flush today. Read `engine::record_settled` (55-70): confirmed the
    `pending` lock is dropped before `snapshot::record`. Read
    `snapshot::record` (52-66) → `commit_on` (153-178): confirmed
    `commit_as` writes the ref without CAS on the parent. Cross-referenced
    the two single-file findings this synthesis depends on.
