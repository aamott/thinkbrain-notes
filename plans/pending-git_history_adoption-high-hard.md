# Git History Adoption

## Goal

Make established Git history available in Version history instead of presenting
every existing file as part of one synthetic first snapshot.

## Scope

Import reachable commits, trees, and blobs into ThinkBrain's hidden repository
without modifying the workspace's `.git` or a linked remote. A configured Git
link is the primary source; without one, a workspace-local `.git` is imported
read-only. Shared commits are deduplicated by object id. Unrelated sources stay
distinct rather than being silently grafted together.

Version history must traverse the imported graph, preserve original timestamps
and messages, deduplicate identical file versions, and remain usable after the
source repository becomes unavailable.

Out of scope: exposing branches, staging, rebasing, or other source-control UI;
rewriting user-owned history; and making the user's `.git` the restore backend.

## Architecture Decisions

- The hidden repository remains the only restore backend and durable history
  store used by ThinkBrain.
- Remote and local Git history use one object-ingestion path. Source selection
  changes; storage and reading do not.
- A configured Git link is canonical for sync. A local `.git` is the fallback
  history source when no link exists.
- When both sources exist, common object ids deduplicate naturally. Unrelated
  histories retain separate imported roots and source metadata.
- Migration never rewrites the linked remote, the local `.git`, or existing
  ThinkBrain commits.
- History traversal is graph-aware rather than first-parent-only. Pagination
  replaces a silent fixed scan horizon.

## Status

- ⬜ pending — ingest remote and local Git history through one read-only path
- ⬜ pending — read per-file versions across the imported commit graph
- ⬜ pending — migrate workspaces that already have a synthetic first snapshot
- ⬜ pending — explain history sources and truncation without Git jargon
