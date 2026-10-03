# Auto Sync

Local history, Git sync, and cloud conflict rescue are one notes feature.
Use cases live in `plans/app-vision.md`; editing guidance lives in
`.agents/skills/sync-history/SKILL.md`.

## Decisions

- One hidden repository per workspace in OS app-data records versions even
  without sync. It supplies restore points and retained merge baselines, never
  metadata for a cloud daemon to replicate.
- Git uses bundled gix, not system Git. Existing clones use their checked-out
  branch; app imports start with the remote default. Fetch/push agree on the
  selected branch; a conflicting checkout needs attention, not an automatic switch.
- Never modify the user's `.git`. Copy its reachable history read-only when
  there is no Git link; a configured link is primary. Keep imported history
  durable and unrelated roots separate.
- Cloud daemons move files; ThinkBrain detects conflict copies and retains the
  pre-divergence ancestor in hidden history. Use three-way text merging with an
  identified base; if ancestry is missing or ambiguous, preserve both versions
  for manual review. Do not guess from timestamps or the newest snapshot.
- Every resolution is undoable: preserve both sides before writing, reject
  stale inputs, and remove a conflict copy only after success. Binaries offer
  whole-file choices. Ancestors needed by unresolved conflicts must not be pruned.
- Share one conflict UI and file-history UI across transports, responsive on
  desktop/mobile, with plain source labels and no branch/staging controls.
- Reuse the watcher and per-workspace serialization. Automatic Git trips use
  quiet-time plus last-attempt interval; persist last success for reopen gating
  (see `docs/superpowers/specs/2026-08-28-sync-schedule-design.md`).
- Keep settings in app-data and credentials in native secure storage. Errors
  name a recovery action. No provider framework without another active transport.

## Remaining Work

- `cloud_merge_base`: associate retained ancestors with cloud conflicts and
  implement three-way merging; this is core work, not gated on conflict volume.
- `cloud_conflict_detection`: real provider fixtures and Windows verification.
- `merge_ui`: image thumbnails and close successful merge tabs.
- `sync_status_history_restore`: Windows verification; existing counters are
  diagnostic only, not prerequisites for cloud merging.
- `history_pruning`: configurable policy/packed compaction decisions and
  cross-platform checks; protect imported history and required merge baselines.
- `restore_workflow`: safe completion, provenance, stale previews, and Undo.
- `selective_restore_editor`: optional editable/per-change restore workspace.
- `provider_sign_in`: optional provider login UX; HTTPS token sign-in works today.

Shipped engine, Git round trips, scheduling, conflict review, current-branch
history/restore, mobile build checks, and Android private Git verification are
summarized in `plans/auto-sync/done-summary.md`. Cloud resolution currently uses
two-version review; cloud merge-base association and three-way cloud merging
remain pending.

## Non-goals

A proprietary cloud service, cloud-provider API integrations, branching/staging/
rebasing UI, Git hooks, AI-generated sync decisions, a general provider framework,
and automatic merges with guessed ancestry. Rename/tree-conflict expansion is
separate work, not implied by text three-way merging.
