# AI Provider Abstraction

## Goal

Define a provider-agnostic interface in `packages/core` that abstracts local
model backends (Ollama, LM Studio) and remote providers (OpenAI, Anthropic,
Google, OpenRouter). UI components consume the interface only — no
provider-specific logic leaks into `apps/desktop`.

This is the foundation story for the `ai` epic. Other stories (chat panel,
context-aware chat, AI-assisted search) depend on it.

## Acceptance Criteria

- [ ] A core interface describes provider capabilities (chat completion,
      streaming, optional embeddings) without naming any concrete provider.
- [ ] At least one local provider adapter (e.g. Ollama) and one remote
      provider adapter are implemented behind the interface.
- [ ] Provider selection is configuration-driven (see model configuration
      story), not hardcoded in UI.
- [ ] No provider SDK is imported from UI components or stores directly.
- [ ] Remote provider calls require explicit user consent / configured
      credentials before any note content is sent.
- [ ] Unit tests cover the interface contract and at least one adapter
      (mocked transport).

## References

- `plans/ai.md` — epic scope and architecture decisions
- `plans/app-vision.md` — AI Native principle, hub-and-spoke rule
- `plans/technical-decisions.md` — AI section, Extensions section
- Prerequisite: `extensions` epic must be active before provider work starts.
