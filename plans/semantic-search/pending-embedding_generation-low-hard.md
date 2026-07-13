# Embedding Generation

## Goal

Generate vector embeddings for note content (title, tags, aliases, body) using
either a local model or an optional remote provider. Local-first must work
offline; remote is opt-in. If the `ai` epic's provider abstraction exists,
reuse it; otherwise ship a minimal embedding-provider interface here and
refactor later.

## Acceptance Criteria

- [ ] A note can be converted into an embedding vector from its parsed content.
- [ ] A local embedding model path works fully offline with no cloud calls.
- [ ] A remote provider path (e.g. OpenAI embeddings) is opt-in and gated by
      explicit user consent/settings.
- [ ] Provider selection is configurable in app settings.
- [ ] Embedding generation failures fail loudly with typed errors.
- [ ] The provider interface is abstracted so a local-only path can proceed
      before the `ai` epic lands.

## References

- `apps/desktop/src/search/searchService.ts` — `buildDocumentRecord` (content to embed)
- `apps/desktop/src/native/commands.ts` — `NativeCommandMap`, native command pattern
- `apps/desktop/src-tauri/src/lib.rs` — native command bridge, `NativeError`
- `plans/semantic-search.md` — Architecture Decisions (provider abstraction)
- `plans/app-vision.md` — AI Native principle (local first, cloud optional)
