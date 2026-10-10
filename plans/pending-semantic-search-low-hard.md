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

- **Embeddings are an ephemeral cache, like FTS5.** Disposable and rebuildable
  from the Markdown files on disk; they live in OS app-data, never in the
  workspace.
- **Local-first embedding providers.** Local models must work fully offline;
  remote providers (e.g. OpenAI embeddings) are optional and gated behind
  explicit user opt-in — local first, cloud optional.
- **Hybrid ranking, not replacement.** `search_index` and `SearchPanel` remain
  the keyword path; a hybrid step merges FTS5 hits with semantic hits into one
  ranked list so exact matches aren't buried by semantic noise.
- **Provider abstraction depends on the `ai` epic.** Reuse `ai`'s abstraction
  if it lands first; otherwise ship a minimal embedding-provider interface
  here and refactor later. Noted, not blocking.
- **Indexing stays non-blocking.** Re-embedding is batched, abortable
  background work with progress reporting keyed on the workspace root, per the
  `indexing-search` architecture.

## Dependencies

- `indexing-search` — FTS5 keyword search (`search.rs`,
  `searchService.ts`/`commands.ts` bridge, `SearchPanel.tsx`), the
  per-workspace SQLite cache, and the search UI surface this epic extends.
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

- ⬜ `embedding_generation` — local and/or remote provider support
- ⬜ `vector_storage` — embeddings cache colocated with the SQLite index
- ⬜ `semantic_query_ranking` — similarity query and ranking
- ⬜ `hybrid_search` — merge FTS5 keyword hits with semantic hits
- ⬜ `semantic_search_ui` — mode/toggle within the existing search panel
- ⬜ `incremental_reembedding` — keep embeddings fresh on edit/rename/delete
