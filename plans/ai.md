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

### Chat UI: assistant-ui on the AI SDK v7 UI layer

Use `@assistant-ui/react`, `@assistant-ui/react-ai-sdk`, `ai@^7`, and
`@ai-sdk/react@^4` together. These are installed in `@thinkbrain/desktop` as of
2026-07-17. Build the assistant-ui `Thread`, composer, messages, tool/activity
renderers, and approval affordances with CSS Modules themed by `--tn-*` tokens.

Tauri does not provide `/api/chat`. A desktop `ChatTransport` implementation
starts/cancels a turn through typed Tauri commands and turns filtered native
events into the AI SDK UI-message stream. Use `useChat` plus
`useAISDKRuntime` because it owns the non-HTTP transport; do not pretend an
ACP event stream is an AI SDK endpoint. The Rust/native model gateway owns
provider requests, cancellation, credentials, and outbound network policy.
The renderer never receives provider credentials.

Persist AI-SDK-compatible `UIMessage` history, thread metadata, and session
links in OS app-data through a local `ThreadHistoryAdapter`/Tauri adapter. Do
not enable Assistant Cloud by default. Persist only completed/explicitly saved
turns and redact secret values from logs, errors, and event payloads.

### ACP is a separate agent mode

ACP does not replace model chat. A normal model-chat thread uses the AI SDK
transport above. An explicit **Agent** session uses ACP and maps one user-made
agent session to one ACP session; it can render through assistant-ui's external
runtime/state adapter but must preserve ACP lifecycle and permission events.
Session metadata links the UI thread and ACP session without assuming their
message formats are interchangeable.

Implement the ACP host in Rust next to the Tauri capability boundary using the
official `agent-client-protocol` runtime crate. The TypeScript
`@agentclientprotocol/sdk` (v1.2.1, installed in `@thinkbrain/desktop`) provides
the renderer-facing ACP adapter: `ClientContext`, `SessionBuilder`,
`ActiveSession`, JSON-RPC, schema types, and protocol constants. It owns the
renderer-side protocol surface; Rust owns filesystem/terminal permissions and
enforcement. If a required host feature is absent in the Rust crate, consume
the official schema and implement the minimum protocol surface—never a
proprietary replacement.

The deterministic host exposes scoped filesystem and terminal capabilities,
session lifecycle, notifications, and permission decisions. An agent requests
a capability; UI presents allow once/always/deny; Rust validates scope and
enforces the recorded decision. The host returns stale-write conflicts/current
content and lets the agent decide how to retry or merge.

### Confirmed integration contracts

Current upstream documentation confirms the selected boundaries. The desktop
AI-SDK transport implements `ChatTransport.sendMessages` and returns a
`ReadableStream<UIMessageChunk>`; a Tauri command/event adapter owns that
stream instead of emulating an HTTP `/api/chat` endpoint. The assistant-ui
panel receives an externally supplied `AssistantRuntimeProvider` runtime, so
the static configuration state can render without inventing a fake provider.

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
- ⬜ AI SDK v7 desktop transport spike — see
  `plans/ai/pending-ai_sdk_tauri_transport-med-hard.md`
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
