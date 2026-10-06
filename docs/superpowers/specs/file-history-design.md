# Current-Branch File History

Scope: `git_history_adoption/graph_version_history` and `history_source_ux`.
Cloud merge-base association and three-way cloud merging remain separate.

## Branch And Source Selection

- Keep hidden `refs/heads/main` as ThinkBrain's recording branch. The remote
  branch is a separate, persisted identity, never inferred from that name.
- A small `history_source` module owns versioned JSON metadata in the hidden
  repository, written atomically under the workspace lane. Store source-ref
  identity and branch bindings per source, plus the active history source.
  Do not add a settings control, credentials, or metadata inside the vault.
- A configured Git link selects its destination-hashed source ref. Without
  one, local `.git` supplies the checked-out branch read-only. If that source
  disappears, its last active imported ref remains readable.
- Existing clones bind their checked-out local branch. Use its upstream branch
  only when the upstream's normalized URL matches the configured Git link;
  otherwise use the same full branch name on the configured remote.
- App imports and folders without `.git` discover the remote symbolic HEAD
  once. Retain that full branch name for subsequent fetches and pushes, even
  if the remote default changes. An entirely empty remote can initialize its
  advertised unborn branch; use `main` only if it advertises no branch at all.
- Detached or changed checkouts and missing selected remote branches block
  sync, not recording/history. Do not recreate a deleted branch on a populated
  remote. Check the checkout before fetch and before apply/push.
- Fetch returns the selected branch and optional tip, moves no refs, and keeps
  shallow rejection and protocol fallback. Publish the binding/source ref only
  after complete validation. Push receives that exact remote branch.
- Before merging unrelated tips, check whether ThinkBrain's active history
  already shares ancestry with any retained external source root. If it does,
  reject an unrelated fetched tip rather than merging/pushing external
  histories together. Ordinary first-time linking of local-only app records
  remains supported. A fetched unrelated root may still be retained read-only.

## History Reader

- Extract graph traversal/pagination from restore/compare commands. Default
  roots are ThinkBrain records plus the selected imported ref. The per-note
  reader also includes retained private checkpoints; the workspace change
  ledger and diagnostic counters do not become a checkpoint ledger.
- Load each reachable commit once, decode all parents without silently
  ignoring malformed data, and fail explicitly on unreadable history.
- Sort by original commit time descending. For tied times, descendants precede
  ancestors by generation depth, then commit ID breaks remaining ties. Collect
  before sorting: a queued-date walk alone cannot promise global date order
  when ancestors have skewed clocks. Display null for dates that cannot be
  represented. Do not use timestamp cutoffs.
- For a note, look up only its path in commit/parent trees. Include changes
  that leave a regular blob, omit deletion rows but retain older versions.
  A merge that simply inherits a parent's content need not duplicate that
  version; a merge-created result is a real version.
- Deduplicate shared commit IDs and consecutive equal-content version events,
  not every blob ever seen. Preserve `A -> B -> A` and deletion/recreation.
  Unchanged commits do not create versions. Checkpoint trees are partial;
  absence from a checkpoint is not a file deletion.
- Classify provenance by membership in imported ancestry, not author names or
  English commit-message parsing. Return `source: local | git` with each row.
- Keep `read(repo, note, limit)` as an internal first-page convenience for
  existing consumers. Status/settlement helpers must not start treating an
  unrelated imported version as proof that a cloud copy is safe to discard.

## Pagination And Restore

- Native `sync_history(rootPath, notePath, limit, cursor)` returns
  `{ changes, nextCursor }`. Limit defaults to 60 in the client and is bounded
  to 1-200 by the backend.
- Use an opaque versioned cursor containing canonical workspace identity, note
  scope, captured main/imported/checkpoint root roles, and the next row offset.
  Validate its shape, bounds, roots, and scope. Never accept a root outside
  protected history.
- Replay the deterministic reader from captured roots on continuation. This
  deliberately trades repeated reads for no cache/session framework. Do not
  truncate at 5,000 commits or silently return partial results.
- New commits do not shift that cursor's pages; restart needs no session state.
  If deliberate checkpoint cleanup invalidates a captured root, report an
  expired cursor with a refresh action. Do not pin undo history indefinitely.
- Compare/restore continue using commit IDs and existing path validation,
  checkpoint ordering, and mutation locks. Restore handles survive restart
  while their history is retained; intentional undo pruning is not reversed.

## UI And Verification

- Preserve the existing panel/layout and native-adapter boundary. Add source
  labels when mixed provenance helps, "Load older versions", loading/retry, and
  refresh. Keep loaded rows on pagination failure and reject stale responses.
- A status refresh resets to a fresh first page; do not append an old page to a
  refreshed timeline. Compare/restore behavior and dirty-buffer handling stay.
- Do not call the first local record file creation, or claim this device has
  observed every edit made elsewhere. No branch/source controls or redesign.
- Rust tests: selected non-default branches and matching upstream mappings;
  persistent selection/default changes; empty vs deleted remote branches;
  checkout mismatch with local history still readable; source removal;
  unrelated source replacement without merge/push; ordinary first linking;
  second parents, shared commits, merge results, repeated contents/reverts,
  deleted/recreated paths, checkpoint compatibility, skewed/tied dates;
  more than 5,000 commits, multiple pages, restart, new commits between pages,
  invalid/cross-scope/expired cursors, imported compare/restore and binary paths.
- UI tests: native page contract, append/loading/retry, provenance/empty copy,
  status refresh vs in-flight page, note switching, compare/restore.
- Run focused checks during implementation, then one final `pnpm qa`.
