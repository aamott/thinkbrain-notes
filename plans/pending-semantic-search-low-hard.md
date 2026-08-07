# Semantic Search

> Embeddings-based search over local Markdown workspaces. A future epic — not
> yet started. Read `plans/app-vision.md` before any work here. This is a stub:
> goals and scope are sketched, but implementation detail is deferred until the
> epic is prioritized.

## Goal

Let users find notes by meaning, not just by exact keyword matches. A query
like "team rituals" should surface a note titled "Weekly retros" even when no
words overlap. Semantic search runs alongside the existing FTS5 keyword search
and the two are combined into a single ranked result list (hybrid search).

## Scope

In scope:

- embedding generation for note content (local models and/or remote providers)
- vector storage colocated with the existing SQLite index cache
- semantic similarity query and ranking
- hybrid search that merges FTS5 keyword hits with semantic hits
- semantic search UI (toggle or mode within the existing search panel)
- incremental re-embedding when notes are created, edited, renamed, or deleted

Non-goals (deferred or out of scope):

- replacing FTS5 keyword search (it remains the default and the fast path)
- cross-workspace semantic search
- semantic search over non-Markdown attachments
- training or fine-tuning custom models
- mandatory cloud dependency — local-first must remain viable

## Architecture Decisions

### Embeddings are an ephemeral cache, like FTS5

Vector embeddings are disposable and rebuildable from the Markdown files on
disk, exactly like the existing FTS5 index. They live in the OS application-data
directory, never inside the workspace. If the embedding cache is deleted, the
app rebuilds it from the source files.

### Local-first embedding providers

Local embedding models must be fully supported so the feature works offline and
preserves privacy. Remote providers (e.g. OpenAI embeddings) are optional and
gated behind explicit user opt-in. This mirrors the app's AI-native principle:
local models are first-class, cloud is optional.

### Hybrid ranking, not replacement

Semantic search augments rather than replaces FTS5 keyword search. The existing
`search_index` command and `SearchPanel` remain the keyword path. A hybrid
ranking step merges FTS5 hits (exact-match strength) with semantic hits
(meaning similarity) into one ranked list. Exact keyword matches should not be
buried by semantic noise.

### Provider abstraction depends on the `ai` epic

If the `ai` epic lands a provider abstraction first, embedding generation
should reuse it. If `ai` is not ready, this epic may ship a minimal
embedding-provider interface of its own and refactor into the shared `ai`
abstraction later. This dependency is noted, not blocking — a minimal local-only
path can proceed independently.

### Indexing stays non-blocking

Re-embedding a workspace must not block the editor, matching the existing
indexing constraint. Batched, abortable background work with progress reporting,
keyed on the workspace root path, following the non-blocking indexing architecture
in the `indexing-search` epic.

## Dependencies

- `indexing-search` (done) — FTS5 keyword search, the per-workspace SQLite
  cache in OS app-data, and the existing search UI surface are the foundation
  this epic extends.
  - `plans/wip-indexing-search-med-med.md` — indexing/search architecture and
    remaining frontend wiring
  - `apps/desktop/src-tauri/src/commands/search.rs` — shipped native FTS5 backend:
    document indexing, index search, clearing, removal, and cache management
  - `apps/desktop/src/search/SearchPanel.tsx` and
    `apps/desktop/src/search/searchPanelModel.ts` — current frontend search
    surface and placeholder state model
  - A future typed frontend bridge remains planned for the native search commands;
    no bridge file is assigned yet.
- `ai` (stub, not started) — optional provider abstraction for remote
  embeddings. A minimal local-only path can proceed without it.

## Validation

- `cargo test` for any new Rust vector storage / search commands.
- Vitest unit tests for the frontend semantic/hybrid search service —
  co-located `*.test.ts`.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- Manual / E2E: open a workspace, enable semantic search, query by meaning,
  confirm hybrid results rank exact keyword matches appropriately.

## Status

- ⬜ Embedding generation — local and/or remote provider support
- ⬜ Vector storage — embeddings cache colocated with the SQLite index
- ⬜ Semantic similarity query and ranking
- ⬜ Hybrid search — merge FTS5 keyword hits with semantic hits
- ⬜ Semantic search UI — mode/toggle within the existing search panel
- ⬜ Incremental re-embedding — keep embeddings fresh on edit/rename/delete
