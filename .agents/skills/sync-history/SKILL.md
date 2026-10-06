---
name: sync-history
description: Use when editing sync, file history, snapshots, Git links, cloud conflict resolution, or restore behavior in ThinkBrain Notes, including native code, UI, tests, and plans.
user-invocable: false
---

# Sync And File History

Read `plans/app-vision.md` and the owning epic before editing. This is a notes
feature, not a source-control product.

## Basic Use Cases

- One computer: automatic local history, comparison, and safe restore; zero setup.
- Git: existing history and sync for the current branch; no branch-management UI.
- OneDrive/Syncthing: daemon-driven file sync, with retained history providing
  the pre-divergence common ancestor for three-way conflict resolution.

## Guardrails

- Keep history and merge baselines in the hidden OS app-data repository, outside
  the synced vault. The ancestor need not live in the user's `.git` or conflict copy.
- Record the baseline before divergence and associate its identity with the
  competing versions. A latest snapshot or timestamp alone is not proof of ancestry.
- Merge text three ways when the base is identified. Unknown/ambiguous ancestry
  stays a manual choice; never silently discard either version. Pin needed bases
  through restart, pruning, and undo clearing until they are no longer required.
- Checkpoint both sides before resolution/restore writes and reject stale inputs.
  Binary files get whole-file choices, not invented text diffs.
- Existing clones use the checked-out branch; app imports start with the remote
  default. Fetch and push use the same selection. Explain checkout/link mismatch;
  never switch branches, write the user's `.git`, or silently graft unrelated history.
- Read all merge ancestry within the selected branch; collapse redundant content
  without hiding real reverts or deletion/recreation. Imported versions survive
  source removal; retained unrelated roots do not join the active note timeline.
- First linking of local records is supported. Do not automatically merge unrelated
  external histories when a Git link is replaced or its history rewritten.
- Prefer one simple file timeline, compare/restore, and "Load older versions".
  Include existing snapshots directly; no migration framework or source browser.
- Reuse existing watcher, serialization, gix, and native adapters. No provider
  framework, telemetry prerequisite, or speculative infrastructure.

## Current Gaps And Checks

Current-branch selection and paged graph history are implemented; architecture:
`docs/superpowers/specs/file-history-design.md`. Cloud baseline association and
three-way cloud merging remain pending `auto-sync/cloud_merge_base`.
Run focused Rust/UI tests for behavior changes and `pnpm qa` before completion.
Use disposable workspaces/remotes for native testing (`pnpm desktop:tauri dev`).
