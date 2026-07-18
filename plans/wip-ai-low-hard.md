# AI

> Optional, privacy-preserving desktop AI. The UI uses assistant-ui and the
> Vercel AI SDK UI layer; ACP remains the host-to-coding-agent protocol. Read
> `plans/app-vision.md`, `plans/technical-decisions.md`, and the ACP skill
> before implementing a story.

## Goal

Provide local-first model chat and explicit ACP agent sessions in the desktop
assistant panel without exposing credentials to the renderer, placing app data
in the vault, or making host-side decisions that belong to an agent.

## Scope

**In scope:** provider/model configuration; desktop chat transport and UI;
local chat history; ACP lifecycle, capabilities, and permissions; opted-in
active-note/workspace context; and a small bridge toward semantic search.

**Out of scope:** mandatory AI, Assistant Cloud, raw provider keys in React,
proprietary agent protocols, host-side planning/editing logic, and standalone
semantic search/embeddings (owned by `semantic-search`).

## Architecture Decisions

### Chat UI: assistant-ui with useExternalStoreRuntime

Use `@assistant-ui/react` with `useExternalStoreRuntime` for the assistant
panel. The renderer owns message state and consumes Tauri events directly;
there is no AI SDK transport layer. Build the `Thread`, composer, messages,
tool/activity renderers, and approval affordances with Tailwind v4 utilities
themed by `--tn-*` tokens (see AGENTS.md UI section, updated 2026-07-18).

The desktop previously prescribed the Vercel AI SDK UI layer (`ai@^7`,
`@ai-sdk/react@^4`, `@assistant-ui/react-ai-sdk`, `useChat` +
`useAISDKRuntime`, a custom `ChatTransport` returning
`ReadableStream<UIMessageChunk>`). That was revised on 2026-07-18 after the
ACP-in-Rust decision: the renderer talks to an agent process, not an LLM
provider, so the AI SDK's transport, provider abstraction, `streamText`, and
`UIMessage`/`UIMessageChunk` schema do not apply. ACP `session/update`
variants (`Plan`, `AvailableCommandsUpdate`, `CurrentModeUpdate`,
`ConfigOptionUpdate`, `SessionInfoUpdate`, `UsageUpdate`, `ToolCallUpdate`,
`request_permission`) have no natural `UIMessageChunk` target and would be
stuffed into `metadata`/`annotations`. `useExternalStoreRuntime` models ACP
semantics as first-class `ThreadMessageLike` parts instead. The `ai`,
`@ai-sdk/react`, and `@assistant-ui/react-ai-sdk` dependencies are removed.

Persist `ThreadMessageLike` history, thread metadata, and session links in OS
app-data through a local `ThreadHistoryAdapter`/Tauri adapter. Do not enable
Assistant Cloud by default. Persist only completed/explicitly saved turns and
redact secret values from logs, errors, and event payloads.

### ACP is the agent protocol (host-owned in Rust)

ACP is the agent protocol. An explicit **Agent** session maps one user-made
agent session to one ACP session and renders through assistant-ui's
`useExternalStoreRuntime` adapter while preserving ACP lifecycle and
permission events. Session metadata links the UI thread and ACP session
without assuming their message formats are interchangeable.

Implement the ACP host in Rust next to the Tauri capability boundary using the
official `agent-client-protocol` Rust crate. Rust owns the full ACP client
lifecycle: `initialize`, `session/new`, `session/prompt`, `session/update`
reading, `session/cancel`, and later `session/request_permission` enforcement.
It emits typed Tauri events filtered by session ID. The renderer never imports
`@agentclientprotocol/sdk` — it only calls Tauri commands and listens for
events. The `@agentclientprotocol/sdk@1.2.1` TypeScript dependency is removed
once the Rust side is wired. If a required host feature is absent in the Rust
crate, consume the official schema and implement the minimum protocol
surface—never a proprietary replacement.

The deterministic host exposes scoped filesystem and terminal capabilities,
session lifecycle, notifications, and permission decisions. An agent requests
a capability; UI presents allow once/always/deny; Rust validates scope and
enforces the recorded decision. The host returns stale-write conflicts/current
content and lets the agent decide how to retry or merge.

### Confirmed integration contracts

The renderer's `useExternalStoreRuntime` adapter consumes Tauri events
(`agent://session-update`) and produces `ThreadMessageLike` objects directly.
`onNew` calls a Tauri `agent_prompt` command; `abortSignal` maps to
`agent_cancel`. The assistant-ui panel receives an externally supplied
`AssistantRuntimeProvider` runtime, so the static configuration state can
render without inventing a fake provider.

ACP agent mode follows the official session lifecycle: initialize, create or
load a session, prompt, receive streaming updates, cancel, and close. A
permission request carries the session ID, tool-call update, and protocol
supplied options. The UI displays those options; the deterministic native host
validates and enforces the selected outcome. It never selects an option or
reasons on an agent's behalf.

### Shared contracts, configuration, and consent

`packages/core/src/ai/` contains platform-neutral value types and contracts:
provider/model configuration shape, chat/agent session metadata, consent
records, and capability/permission requests. Concrete provider clients,
credential storage, Tauri IPC, ACP runtime, and React hooks remain in desktop
adapters/native code. This retains the hub-and-spoke boundary without forcing
network implementations into `packages/core`.

Cloud providers and any note/workspace context are opt-in. The composer shows
what context is about to leave the device, and a remote-context permission is
separate from ACP capability permission. Credentials and app/workspace settings
live in OS app-data; keys use the OS secret store when available rather than
plain JSON.

## Dependencies

- `ui-shell` supplies the right assistant panel and design tokens; it can ship
  the panel container before AI behavior is enabled.
- The `extensions` epic remains prerequisite for third-party providers/agents.
  Built-in local chat and the host transport may be planned independently but
  must not create an extension bypass.
- `semantic-search` consumes approved AI contracts later; it does not block
  chat or ACP.

## Status

- ✅ assistant-ui panel foundation — see
  `plans/ai/done-assistant_panel_foundation-med-med.md`
- ✅ Tailwind v4 switch for desktop UI (2026-07-18) — recorded in AGENTS.md;
      agent chat components use Tailwind utilities mapped to `--tn-*` tokens
- ✅ AI SDK removal (2026-07-18) — `ai`, `@ai-sdk/react`,
      `@assistant-ui/react-ai-sdk` removed from `@thinkbrain/desktop`;
      `@agentclientprotocol/sdk` removed once Rust ACP is wired. Renderer uses
      `useExternalStoreRuntime` directly. See the Architecture Decisions
      section above for rationale.
- 🔄 agent chat text streaming MVP — see
  `plans/ai/pending-agent_chat_text_streaming_mvp-high-hard.md`
- ❌ AI SDK v7 desktop transport spike — superseded 2026-07-18 by the
      `useExternalStoreRuntime` decision; see
      `plans/ai/pending-agent_chat_text_streaming_mvp-high-hard.md`. The
      `pending-ai_sdk_tauri_transport-med-hard.md` story is obsolete and
      should be deleted.
- ⬜ assistant-ui desktop thread and local history — see
  `plans/ai/pending-assistant_ui_desktop_thread-med-med.md`
- ⬜ provider/model configuration and native gateway — see
  `plans/ai/pending-provider_configuration_and_gateway-med-hard.md`
- ⬜ ACP runtime selection and host lifecycle — see
  `plans/ai/pending-acp_host_runtime-med-hard.md`
- ⬜ ACP capabilities and permission UI — see
  `plans/ai/pending-acp_capabilities_and_permissions-med-hard.md`
- ⬜ opted-in active-note/workspace context — see
  `plans/ai/pending-context_aware_chat-low-med.md`
- ⬜ AI-assisted discovery bridge — see
  `plans/ai/pending-ai_assisted_search-low-hard.md`
- ❌ prior generic provider/chat stories predated assistant-ui, AI SDK transport,
  and the separate ACP session model; they were superseded and removed.
