# AI-Assisted Search and Discovery

## Status

⬜ Later bridge; does not block chat, ACP, or local FTS5.

## Goal

Add an opt-in native boundary for related-note discovery/summarization that can consume semantic-search outputs without replacing deterministic FTS5 or leaking workspace content.

## Exact likely files

- `packages/core/src/ai/discovery.ts` and tests — provider-neutral request/result/fallback contracts.
- `apps/desktop/src/search/aiDiscoveryAdapter.ts` and tests — native adapter and UI-safe state.
- `apps/desktop/src/native/ai.ts`, `src/native/commands.ts` — typed calls/events.
- `apps/desktop/src-tauri/src/ai/discovery.rs`, `commands/ai.rs` — bounded request, provider capability check, consent gate.
- Existing search owners in `apps/desktop/src/search/` and `packages/core` — integration only; do not alter FTS5 semantics.

## Contracts and typed boundary

`AiDiscoveryRequest` carries query/document IDs, bounded excerpts or approved semantic-search references, operation (`related-notes`|`summarize`), and consent scope. `AiDiscoveryResult` carries ranked note IDs/snippets or a redacted summary; errors are `no_provider`, `capability_unavailable`, `consent_required`, `cancelled`. Remote embedding/summary needs explicit `remote-context`; local execution is allowed offline. No provider SDK in core.

## Dependencies and order

AI contracts/consent, provider gateway capability discovery, and semantic-search/indexing contracts. This story is last in the AI epic and must not block model chat/ACP.

## Tests

No provider/consent denial leaves FTS5 result unchanged; bounded/cancelled request; remote consent prompt; redaction; unsupported capability fallback; duplicate/empty result handling. Assert no provider secret, full workspace dump, or unapproved context enters events/history.

## Manual checks

Compare deterministic search before/after, try no provider and denied consent, inspect event/history payloads, and verify related-note failure degrades without changing FTS5. On mobile, use the same adapter and confirm unsupported local/remote capability is reported clearly.

## Consent, local/cloud, and mobile constraints

Local discovery may run offline when a local capability exists. Remote embedding or summary requires explicit `remote-context` consent, separately from model and ACP permission. Mobile reuses the same core/native adapters and must handle network transitions, storage limits, and app suspension without blocking deterministic FTS5.

## Acceptance criteria

- [ ] Discovery is opt-in, bounded, cancellable, consent-aware, and degrades without changing deterministic FTS5 results.
- [ ] Semantic-search integration consumes approved references only; no full workspace dump or secret/history leakage.
- [ ] Unsupported/no-provider/remote-denied/mobile-unavailable states are explicit.

## Automated validation

Run core/native/search adapter tests for fallback, consent, redaction, cancellation, bounded results, and unchanged FTS5 semantics; run `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Manual desktop/mobile checks

Desktop: compare search before/after with no provider/denied consent and inspect events/history. Mobile: test same adapter, network/storage transitions, suspension, and clear unavailable state.

## Non-goals

No replacement for FTS5, automatic indexing/embedding, ACP tool/context injection, provider implementation, background cloud sync, or hidden consent.

## Handoff expectations

Deliver semantic-search owner contract, opt-in/consent decision, bounded result model, fallback tests, manual desktop/mobile report, and unresolved questions.
