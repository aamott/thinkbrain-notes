# Open Items

Running list of open design decisions, deferred follow-ups, and non-blocking
debt discovered during implementation. Unlike `STATUS.md` (a terse snapshot),
this file is allowed to grow. Close items by moving them to "Resolved" with a
one-line outcome, and prune Resolved entries occasionally — git keeps history.

## Open

| ID | Area | Item | Raised | Notes |
|----|------|------|--------|-------|
| OI-001 | core / frontmatter | Serialization preserves unknown frontmatter **fields by value** but not original YAML formatting or comments. | WI-004 | Fine for MVP given the "no rewrite on open/index" policy. Revisit if comment-preserving round-trips are needed (would require editing the YAML AST in place rather than re-stringifying). |
| OI-002 | desktop / build | Vite warns the desktop JS chunk is >500 kB (CodeMirror + react-arborist/react-dnd, now ~940 kB). | WI-005 | Non-blocking. Consider code-splitting the editor/search/tree via dynamic `import()` if startup/bundle size matters later. |
| OI-003 | desktop / search | No file watcher: external edits aren't reflected until workspace reopen. Index rebuilds fully on open + incremental upsert/remove on in-app create/save/rename/delete. | WI-006 | Matches architecture (watcher deferred). Revisit with the indexing-search file-watching plan. |
| OI-004 | search / native | Each index command opens its own `rusqlite::Connection` (no pool/managed state). | WI-006 | Fine for single-user sequential use; revisit if concurrency/perf becomes an issue. |
| OI-005 | search / arch | Indexing is frontend-driven (frontend reads files + runs core `parseNote`, sends records to native SQLite) rather than fully-native scanning. | WI-006 | Deliberate: reuses the tested core parser and keeps the UI responsive; trades some IPC overhead. |

## Resolved

_None yet._
