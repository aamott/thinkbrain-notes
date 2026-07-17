# AI-Assisted Search and Discovery

## Goal

Define an opt-in boundary for AI-assisted discovery, related-note suggestions,
and summarization. This is a bridge to `semantic-search`, not a replacement for
the deterministic FTS5 search path.

## Acceptance Criteria

- [ ] Core contracts can describe an embedding/discovery request without
      importing a provider SDK; the native gateway owns concrete execution.
- [ ] AI-assisted "find related notes" uses workspace context, not just FTS5
      keyword match.
- [ ] Remote embedding or summary calls require explicit content consent.
- [ ] Falls back gracefully when no provider is configured, consent is denied,
      or the provider lacks the requested capability.
- [ ] Does not break the existing SQLite FTS5 search path.
- [ ] Tests cover the fallback (no provider) path.

## References

- `plans/app-vision.md` — `semantic-search` epic (depends on `indexing-search`,
  possibly `ai`)
- `plans/ai.md`
- `plans/semantic-search.md`
- Depends on: `pending-provider_configuration_and_gateway-med-hard.md`.
