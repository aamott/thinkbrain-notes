# Context-Aware Chat

## Status

⬜ Split from model transport. Only explicit model-chat context; ACP agents use requested capabilities/permissions instead.

## Product questions — STOP before UI

Decide: (1) which source can be attached first (active note, text selection, bounded workspace summary), (2) exact byte/item/token limits, (3) whether context chips show filenames and previews, (4) how users revoke/remember remote-context consent, and (5) what happens when the active note changes while the composer is open. **STOP:** no context chip/mockup or implementation until these are answered and the data-leaving copy is approved.

## Goal

Let users explicitly review and attach bounded active-note/selection/workspace-summary context to model chat. Local providers can use it offline; remote context requires a separate visible consent decision. ACP gets no hidden prompt-injected context.

## Exact likely files

- `packages/core/src/ai/context.ts` and tests — bounded selection/redaction contracts.
- `apps/desktop/src/agent/contextModel.ts` — selection state, preview, byte/token limit, cancellation.
- `apps/desktop/src/agent/AssistantPanel.tsx`, `src/agent/ContextAttachment.tsx` — composer disclosure/removal after STOP.
- `apps/desktop/src/native/ai.ts`, `src/native/commands.ts` — typed bounded context-preparation/consent calls.
- `apps/desktop/src-tauri/src/ai/context.rs` — read active note/selection/workspace summary through existing native adapters, redact credentials/app settings, enforce bounds.
- `apps/desktop/src-tauri/src/commands/ai.rs` — `ai_prepare_context` and consent-aware model request DTOs.
- `apps/desktop/src/agent/contextModel.test.ts`, component tests, Rust redaction/bounds tests.

## Contracts and typed boundaries

`ContextSelection` is `{kind, sourceId, label, byteLimit, contentDigest}`; `PreparedContext` contains bounded text only inside the native request path and a renderer-safe `{kind,label,bytes,itemCount,redactedPreview}`. `ai_prepare_context` returns preview metadata unless local send is selected; `ai_send_context` requires `{requestId, contextId, consentScope}` and native consumes the bounded content. `remote-context` consent is separate from `remote-model` and ACP capability consent. Context is never hidden in an ACP prompt.

Failure codes: `context_source_unavailable`, `context_limit_exceeded`, `context_cancelled`, `context_redaction_failed`, `context_consent_required`. Native reads current document/index data through existing workspace/search boundaries; no automatic workspace dump.

## Dependencies and order

1. AI contracts/consent.
2. Provider gateway can classify local versus remote.
3. Existing active-document/workspace adapters and bounded native preparation.
4. Product STOP, then UI.
5. ACP permission story remains separate; semantic search only supplies an approved summary later.

## Tests

Toggle off/removed attachment sends no context; local send succeeds offline; remote send blocked without explicit `remote-context`; bounds/cancel; active note unavailable; credential/app-setting redaction; stale selection; no workspace-wide dump; renderer only sees preview metadata; ACP path receives no hidden context.

## Manual checks

Attach an active note and selection, inspect preview/byte count, remove before send, test local and remote consent separately, switch active note, cancel preparation, and inspect native events/logs/history for full-content leaks. Verify FTS5/search remains unchanged.

## Consent, local/cloud, and mobile constraints

Local provider context does not leave device. Any remote model request with context shows destination and asks separately even if model consent was previously granted. On mobile, selection extraction, keyboard/composer layout, storage/network transitions, and app suspension cancellation need manual checks; use same Tauri adapters, not mobile-specific core APIs.

## Acceptance criteria

- [ ] Users explicitly review/remove bounded context and local/remote consent remains separate.
- [ ] Native preparation enforces bounds/redaction/cancellation; ACP receives no hidden context.
- [ ] Missing/stale sources, no consent, errors, mobile suspension, and narrow UI states are tested.

## Automated validation

Run core/native/component tests for bounds, redaction, consent, cancellation, stale selection, and no workspace dump; run `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Manual desktop/mobile checks

Desktop: attach/remove active note/selection, compare local/remote consent, switch note, cancel, and inspect events/history. Mobile: test keyboard, selection, network transition, and suspension cancellation.

## Non-goals

No ACP prompt injection, capability bypass, automatic consent, unbounded workspace summarization, provider implementation, semantic-search replacement, history redesign, or UI before STOP.

## Handoff expectations

Deliver approved context mockups/copy, bounded contract, redaction/consent tests, manual desktop/mobile report, and unresolved product questions.
