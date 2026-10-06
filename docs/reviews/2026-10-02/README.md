# Review — 2026-10-02 — Git history adoption (staged changes)

## Scope

Reviewed all staged changes (`git diff --cached`): 55 files, ~6,600 insertions. The changeset implements git history adoption — importing a vault's existing `.git` history into the hidden app-data history repo, binding fetches to the checked-out branch, and exposing paged history to the HistoryPanel UI.

Eight `small` subagents in two batches covered:

| Batch | Area | Files |
|-------|------|-------|
| 1 | New ingest/walk core | `history_ingest.rs`, `history_walk.rs` |
| 1 | New source/page modules | `history_source.rs`, `history_page.rs` |
| 1 | Modified sync engine | `history.rs`, `network.rs`, `round.rs` |
| 1 | Bootstrap/wiring | `mod.rs`, `bootstrap.rs`, `engine.rs`, `push.rs`, `maintain.rs`, `import.rs`, `registry.rs`, `credentials.rs`, `test_support.rs` |
| 2 | New Rust tests | `history_ingest_tests.rs`, `history_ingest_safety_tests.rs`, `round_branch_tests.rs` |
| 2 | Page/source/misc tests | `history_page_tests.rs`, `history_source_tests.rs`, `bootstrap_tests.rs`, `import/registry/resolve*/settle_tests.rs` |
| 2 | Frontend | `HistoryPanel.tsx` + tests, `historyTypes.ts`, `syncService.ts` + test, `commands.ts`, `useShellState.test.tsx`, `copy.test.tsx` |
| 2 | Docs/plans/config | `file-history-design.md`, all `plans/` changes, `README.md`, `.gitignore`, agent/skill files, `sync_ui_mockup.html` |

## Summary

- **21 findings** originally: **0 critical / 0 high / 5 medium / 16 low**
- **11 addressed** across two passes (see "Resolved" below); **10 remain, all low**
- Frontend review came back **clean** — IPC contract, cursor pagination state machine, a11y, and token usage all verified.

## Low urgency — implementation

| Finding | File | Difficulty |
|---------|------|------------|
| [Symbolic HEAD outside refs/heads → misleading errors](symbolic-head-outside-heads-misleading-errors,easy,low.md) | `sync/history_source.rs` | easy |
| [Non-UTF8 branch names lossy-converted into bindings](non-utf8-branch-names-lossy-conversion,easy,low.md) | `sync/history_source.rs`, `sync/network.rs` | easy |
| [Timeline does not follow renames](timeline-does-not-follow-renames,medium,low.md) | `sync/history_walk.rs` | medium |
| [Symlink/gitlink transitions invisible to history](symlink-gitlink-transitions-invisible,medium,low.md) | `sync/history_walk.rs` | medium |
| [Detached-checkout pause invisible to user](detached-checkout-pause-invisible,trivial,low.md) | `sync/bootstrap.rs` | trivial |

## Low urgency — performance

| Finding | File | Difficulty |
|---------|------|------------|
| [Every page recomputes the full event stream](every-page-recomputes-full-event-stream,medium,low.md) | `sync/history_page.rs` | medium |
| [Parent commits re-decoded once per child edge](parent-commits-redecoded-per-edge,easy,low.md) | `sync/history_walk.rs` | easy |

## Low urgency — tests

| Finding | File | Difficulty |
|---------|------|------------|
| [Populated-remote branch_missing path untested](populated-remote-branch-missing-untested,easy,low.md) | `sync/round_branch_tests.rs` | easy |
| [history_page_tests robustness gaps](history-page-tests-robustness-gaps,easy,low.md) | `sync/history_page_tests.rs` | easy |
| [history_source_tests coverage gaps](history-source-tests-coverage-gaps,easy,low.md) | `sync/history_source_tests.rs` | easy |

## Resolved

Addressed across two passes; finding files deleted per convention.

Pass 1 (trivial fixes):

- **Fetch skipped when ref map empty but tip resolved** (`network.rs`) — now errors `sync.branch_unknown` instead of returning an unpopulated tip.
- **Cancelled-fetch test vacuous** (`history_ingest_safety_tests.rs`) — asserts `sync.remote_timeout` on failure.
- **`merge_base` errors conflated with "unrelated"** (`round.rs`) — `NotFound` mapped to `None`, real errors propagate via `sync.merge_failed`.
- **Binding file rewritten every round** (`history_source.rs`) — `bind` skips `store()` when unchanged.
- **Cursor `ws` fallback trusted caller `root_path`** (`history.rs`) — falls back to `resolve_workspace_root`, never the raw string.
- **Pending stories deleted without done- equivalents** — `done-ingest_git_history` restored; `migrate_synthetic_snapshots` recorded as deliberately dropped in the epic.
- **Mockup unvetted external script** — swapped to `cdn.tailwindcss.com`.
- **`read_all` hang guard** (subset of history-page-tests finding) — asserts non-empty page.
- **`ref_value` deduplicated** (was defined in 3 test files) into `test_support.rs`.

Pass 2 (medium/high-priority findings, with new tests):

- **Refs published before unrelated-history refusal** (`round.rs`) — `refuse_unrelated` now runs immediately after fetch, before `retain_fetched`/`REMOTE_REF`/`bind`; `activate` is deferred until the join succeeds. `a_rewritten_remote_is_refused_before_anything_joins` updated: source ref, REMOTE_REF, and retained set now verified unchanged.
- **Unborn HEAD with sibling commits imports nothing** (`history_ingest.rs`) — `head.id() == None` now checks `carries_commits` and errors `sync.git_history_unsupported` when other refs have history. Covered by `an_unborn_head_with_committed_siblings_is_an_error`.
- **Unreadable settings flip git_link_configured to false** (`registry.rs`) — attach now fails closed: an unreadable settings file is treated as possibly-linked, suppressing the `.git` import rather than failing the whole attach. Covered by `an_unreadable_settings_file_does_not_fail_the_attach`.
- **Full `.git` decode+verify on every attach** (`history_ingest.rs`) — early-out when `WORKSPACE_SOURCE_REF` already names the tip. Covered by `an_unchanged_tip_is_not_imported_again`.

## Notes

- **Related root causes:** the symlink/gitlink finding merges three subagent reports (dropped `Removed` event, `blob_at` link exclusion, missing test fixture) — fix together. The unborn-HEAD finding merges the implementation bug and its missing test.
- **State ordering vs corruption:** the round.rs publication-ordering finding does not corrupt state (retries re-fire the refusal), but it contradicts the module's stated invariant and exposes a rejected foreign graph to the history panel.
- **Pre-existing:** README's reference to `plans/ai.md` (actual file `pending-ai-med-hard.md`) is broken but untouched by this diff.
- **Verified by parent:** all medium-urgency findings were re-verified by reading the cited code directly.
