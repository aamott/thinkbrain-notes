# AI Contracts and Consent Records

## Status

⬜ Planned first implementation story. This is the platform-neutral foundation; it does not call providers or ACP.

## Goal

Define the serializable contracts shared by model chat, ACP metadata, context consent, and local history without importing React, Tauri, an SDK, or a provider. Keep secret material out of every contract.

## Exact likely files

- `packages/core/src/ai/index.ts` — public exports.
- `packages/core/src/ai/contracts.ts` — provider/model, chat-thread, ACP link, stream, and typed error unions.
- `packages/core/src/ai/consent.ts` — local/cloud/context consent records and decision helpers.
- `packages/core/src/ai/*.test.ts` — schema, redaction, round-trip, and decision tests.
- `packages/core/src/index.ts` — re-export `./ai`.

## Contracts and typed boundaries

Use stable camelCase TypeScript values in core; native adapters map their Rust snake_case payloads at the boundary.

- `AiProviderKind = "local" | "remote"` and `AiProviderConfig` contains `providerId`, `displayName`, `kind`, `endpoint`, `modelId`, `enabled`; it never contains a token or password.
- `AiChatThread` contains `threadId`, `mode: "model" | "agent"`, optional `providerId/modelId`, and timestamps. `AgentSessionLink` contains `threadId`, `agentId`, `acpSessionId`, and `workspaceRoot`.
- `AiConsentScope = "remote-model" | "remote-context" | "acp-capability"`; `ConsentDecision = "allow-once" | "allow-always" | "deny"`. Consent is explicit and scoped; ACP capability decisions are not reused as cloud-content consent.
- `AiStreamUpdate` is a discriminated union for `text-delta`, `started`, `finished`, `cancelled`, and `error`; errors use stable codes and redacted details.
- `AgentSessionUpdate` carries `sessionId`, `sequence`, and a protocol-derived update kind. Unknown ACP variants are retained as `unknown` metadata only at the native-to-renderer boundary, never guessed into a tool result.
- `ContextSelection` identifies `active-note`, `selection`, or `workspace-summary`, with byte/item limits and a redacted preview; it does not contain credentials or app settings.

Do not make these contracts a second provider or ACP implementation. The Rust gateway and ACP host remain authoritative for execution.

## Dependencies and order

- Depends only on existing `packages/core` conventions.
- Blocks provider settings, native gateway, history, context chat, and typed event adapters.
- Does not block the assistant panel foundation already marked done.

## Tests

- Valid and invalid provider/thread/session/consent values.
- JSON round trips preserve discriminants and reject unknown unsafe fields.
- Secret-like keys and values are absent from serialized contracts and redacted error helpers.
- Consent decisions are scoped, deny by default, and cannot turn an ACP permission into `remote-context` consent.

## Manual checks

Run core tests/typecheck and inspect emitted declarations to verify no Tauri, React, provider SDK, filesystem, or secret-store import is reachable from `packages/core/src/ai`.

## Consent, local/cloud, and mobile constraints

Local providers may run with no network consent. Remote model and remote context each require an explicit decision and a visible destination. Core must not assume desktop, OS keychain, or network availability; the same contracts are consumed by Tauri Mobile.

## Acceptance criteria

- [ ] Core contracts are typed, serializable, secret-free, round-trip tested, and platform-neutral.
- [ ] Consent scopes are explicit, deny-by-default, and cannot cross-apply between cloud context and ACP capability decisions.
- [ ] Consumers can use the contracts without React/Tauri/provider/secret-store imports.

## Automated validation

Run core contract/consent tests, declaration/import checks, `pnpm lint`, and `pnpm typecheck`.

## Manual desktop/mobile checks

Inspect emitted declarations/import graph on desktop and shared Tauri Mobile builds; verify no credential fields or desktop assumptions.

## Non-goals

No settings UI, secret storage, provider HTTP/client code, ACP process spawning, history persistence, prompt templating, automatic consent, or semantic search implementation.

## Handoff expectations

Deliver contracts, redaction/round-trip tests, consent matrix, import-boundary report, and unresolved product/security questions.
