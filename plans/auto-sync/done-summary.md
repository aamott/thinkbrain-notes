# Auto Sync Epic — Completed Work

All sync runs through one engine: a hidden gix repository per vault, a
per-workspace lane (mutex) so two trips never interleave, and a shared
quiet-time/interval schedule. Conflict handling resolves the obvious cases and
leaves genuine overlaps as ` (from another device)` copies — never data loss.

## Engine & lifecycle (story 0)

- `gix_engine_hidden_repo` — bundled gix engine, hidden repo per vault,
  bootstrap matrix, auto-commit and checkpoint API; measured on a 10k-note
  vault.

## Remote sync (story 6, plus follow-ups)

- `send_pack` — object selection, packfile build, exchange, and the two
  refusals (non-fast-forward, auth).
- `the_round_trip` — fetch → merge → copies → commit → send as one lane-held
  trip; the three-way merge shipped here as reduction to copies rather than
  inside the merge-engine story. Live-verified against GitHub and GitLab on
  protocol v2 (v1 fallback).
- `git_remote_sync` — umbrella for 6a–6f: send-pack, round trip, credential
  adapter + sign-in control, git-link setup UX, import-from-link.
- `git_link_setup_ux` — plain-language link setup; GitHub/GitLab proof.
- `workspace_from_git_link` — clone-first workspace import; non-destructive
  one-way import when the post-import push can't land.
- `import_sign_in_parity` — sign-in reachable from the import dialog.
- `workspace_selector_git_badge` — git-linked indicator (Choice A,
  `FolderGit2`) in the workspace selector.

## Conflict & merge

- `merge_engine` — two-way segmentation, three-way merge, resolution write,
  checkpoint order, CAS guard, cleanup, mutation lock.
- `settle_obvious_conflicts` — both settle rules, the setting, separated
  counts.
- `crash_conflict_copy_multiplication` — a crash mid-conflict no longer
  multiplies numbered copies; `beside_in` reuses the conflict slot.
- `unwritable_note_blocks_vault` — one unwritable note is skipped and reported
  instead of aborting the whole vault's sync.
- `foreground_policy_on_desktop` — closed by superseding design: the shared
  schedule replaced `sync.trigger` (see
  `docs/superpowers/specs/2026-08-28-sync-schedule-design.md`).

## Triggers, feedback, robustness

- `sync_trigger_debounce` — idle debounce (~30s) plus a once-a-minute cap;
  "Sync now" queues on the same lane.
- `sync_trigger_sharp_edges` — portable trigger and backwards-clock cases
  resolved by the shared schedule; the last-sync settings-write race is still
  open in `last_sync_timestamp_skips_the_settings_lock`.
- `lane_test_strength` — the lane test now fails if the workspace mutex is
  removed.
- `large_sync_progress` — first sync shows live phase copy instead of looking
  stuck; byte/object progress deferred.
- `mobile_cross_compile` — gix check-gated in CI for Android/iOS targets plus
  local Android NDK validation.
