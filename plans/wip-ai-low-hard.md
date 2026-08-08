# AI

> Optional, privacy-preserving desktop AI. The renderer uses assistant-ui with
> `useExternalStoreRuntime`; ACP is the host-to-agent protocol owned in Rust.
> Read `plans/app-vision.md`, `plans/technical-decisions.md`, the ACP skill, and
> the linked child stories before implementation.

## Goal

Provide local-first model chat and explicit ACP agent sessions in the desktop
assistant panel without exposing credentials to the renderer, putting app data in
the vault, or making host-side decisions that belong to an agent.

## Scope and invariants

**In scope:** provider/model metadata and native model gateway; native secret-store
consumer boundary; local history; assistant-ui text streaming; ACP registry,
process/session lifecycle, capabilities and consent; opted-in model context; a
later semantic-search bridge; and registration of the trusted assistant built-in.

**Out of scope:** mandatory AI, Assistant Cloud by default, raw provider keys in
React, proprietary agent protocols, host-side planning/editing/merging, automatic
remote context, and replacing deterministic FTS5 search.

- `packages/core/src/ai/` is platform-neutral. It contains values/contracts only;
  no React, Tauri, provider SDK, filesystem, or secret-store dependency.
- All renderer IPC goes through `apps/desktop/src/native/`; components do not call
  Tauri directly. AI renderer surfaces use co-located CSS Modules backed by shared
  `--tn-*` tokens, never Tailwind utility classes. Rust owns provider calls,
  credentials, network policy, ACP process/session lifecycle, and permission
  enforcement.
- ACP uses the official `agent-client-protocol` Rust crate. The renderer never
  imports `@agentclientprotocol/sdk`; the existing dependency is removable only
  once source imports are gone.
- A host is deterministic: it transports protocol requests, validates/enforces
  capabilities, returns stale-write conflicts/current content, and never reasons,
  plans, edits, or merges for an agent.
- Cloud model/context consent is explicit and separate from ACP capability
  permission. Presence of a stored credential or an installed agent is not consent.
- Secrets stay in the extension-owned native secret store. AI consumes a scoped
  native boundary and never duplicates keychain ownership or adds a fallback.

## Implementation order (small subagents)

1. **AI contracts and consent records** —
   `plans/ai/pending-ai_contracts_and_consent-low-hard.md`
2. **ACP agent registry/detection** —
   `plans/ai/pending-agent_registry-low-med.md`
3. **Native secret-store consumer boundary** —
   `plans/ai/pending-native_secret_store_consumer_boundary-med-hard.md`
   (storage implementation remains the extension secret-storage owner).
4. **ACP host/session lifecycle** —
   `plans/ai/pending-acp_host_runtime-med-hard.md`
5. **Provider configuration and native model gateway rollup** —
   `plans/ai/pending-provider_configuration_and_gateway-med-hard.md`
   (superseded rollup; its focused configuration and gateway children own
   implementation).
6. **Provider configuration UI and metadata** —
   `plans/ai/pending-provider_configuration_ui-low-med.md`
   (product-question STOP gate before UI).
7. **Native model gateway** —
   `plans/ai/pending-model_gateway_native-med-hard.md`
   (secret consumer only; no parallel keychain/fallback).
8. **Agent text-streaming renderer/runtime** —
   `plans/ai/pending-agent_chat_text_streaming_mvp-high-hard.md`
9. **Assistant-ui desktop thread and local history** —
   `plans/ai/pending-assistant_ui_desktop_thread-med-med.md`
10. **ACP capabilities, consent, and permission requests rollup** —
   `plans/ai/pending-acp_capabilities_and_permissions-med-hard.md`
   (superseded rollup; native enforcement and UI children own implementation).
11. **ACP native capability enforcement** —
    `plans/ai/pending-acp_capability_enforcement-med-hard.md`
12. **ACP permission-consent UI** —
    `plans/ai/pending-acp_permission_consent_ui-med-med.md`
    (official current ACP option shapes and STOP gate required).
13. **Opted-in model context** —
    `plans/ai/pending-context_aware_chat-low-med.md`
14. **Assistant built-in registration handoff** —
    `plans/ai/pending-assistant_builtin_registration-low-med.md`
    (shared extension bootstrap owns mechanics; do not edit or duplicate the
    extension/Git/journal plans).
15. **AI-assisted discovery bridge, last** —
    `plans/ai/pending-ai_assisted_search-low-hard.md`; semantic-search remains
    its owner and FTS5 is unchanged.

## Confirmed wire/event contracts

- ACP commands: `agent_spawn`, `agent_session_new`, `agent_prompt`,
  `agent_cancel`, `agent_session_close`; all accept typed opaque IDs and
  allowlisted agent/workspace values only.
- ACP events: `agent://session-state`, `agent://session-update`,
  `agent://permission-request`, `agent://permission-resolved`, and
  `agent://error`; all include session/request IDs where applicable, monotonic
  sequence for updates, are session-filtered, replay-safe, and redacted.
- Model gateway commands: `ai_list_providers`, `ai_read_provider_config`,
  `ai_write_provider_config`, `ai_delete_provider_config`,
  `ai_start_model_stream`, `ai_cancel_model_stream`; events:
  `ai://stream-update` and `ai://error`, request-filtered and secret-free.
- History commands: `ai_list_threads`, `ai_read_thread`, `ai_save_thread`,
  `ai_delete_thread`, `ai_clear_threads`; app-data only, versioned/atomic and
  bounded.
- `onNew` maps to `agent_prompt`; `AbortSignal` maps to `agent_cancel`.
  ACP text deltas append to one assistant `ThreadMessageLike` text part; unknown
  update kinds are not guessed into UI content.

## Current reconciled status (as inspected)

- ✅ Assistant panel foundation; visual shell exists.
- ⬜ All behavior below is not implemented. The current
  `apps/desktop/src/agent/AssistantPanel.tsx` still uses a throwing
  `useLocalRuntime` placeholder, disables the composer, and contains visual MCP
  toggles only. `AssistantPanelSurface` lazy-loads it and
  `panelRegistry.tsx` already has the `assistant` panel contribution.
- ⬜ Rust has `agent-client-protocol = "1.2"` in `Cargo.toml`/lock, but no ACP
  module, commands, event emission, process spawn, or lifecycle registration is
  present. `commands/mod.rs` registers only existing workspace/Git/Markdown/search/
  settings/theme handlers; `capabilities/default.json` has no agent capability.
- ⬜ `@agentclientprotocol/sdk` remains in `apps/desktop/package.json`; remove it
  only in the text-streaming/host implementation after confirming no import.
- ⬜ No `packages/core/src/ai/` directory, provider gateway, secret consumer,
  history adapter, or AI consent records currently exist.
- ⬜ `plans/ai/pending-ai_assisted_search-low-hard.md` is intentionally last and
  does not block chat/ACP.

## Dependencies and boundaries

`ui-shell` supplies the panel/tokens and is not reopened by AI. The extension epic
supplies contribution/lifecycle/secret-storage mechanics; AI supplies behavior
and consumes scoped APIs. The beta built-in integration registers ACP Agent Chat
and its credential boundary but must not duplicate provider, ACP, history, or
chat logic. `semantic-search` may consume approved discovery/context contracts;
it does not block chat or ACP.

## Cross-cutting acceptance checks

Every story must include unit/integration tests plus desktop manual checks for
normal, unavailable, cancellation, error, and redaction paths. No real cloud
credential or agent process belongs in CI. Local-only flows must work offline;
remote model/context flows must be visibly consented and cancellable. Tauri
Mobile reuses the same React/core/native adapters, but every story must test or
record keyboard, narrow layout, app suspension/background cancellation, secure
store availability, storage limits, and the absence of desktop PATH/process
assumptions.

## Historical/superseded references

The old generic provider/chat decomposition is superseded by the ordered stories
above. The assistant panel foundation remains complete; it does not
claim runtime behavior. Broad provider and ACP stories are rollups only; focused
children own configuration, native transport/enforcement, renderer UI, host
lifecycle, streaming, and built-in registration separately.
