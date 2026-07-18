# Agent Chat Text Streaming MVP

## Goal

Wire the assistant panel to a real ACP agent end-to-end for text streaming.
Rust owns the ACP protocol and process lifecycle; the renderer owns the
assistant-ui runtime and UI. Ship text-only first; tool calls, permissions,
plans, and MCP servers follow under `acp_capabilities_and_permissions` and
later stories.

## Architecture

### ACP protocol lives in Rust (not the renderer)

The Rust side owns the full ACP client lifecycle using the official
`agent-client-protocol` Rust crate: `initialize`, `session/new`,
`session/prompt`, `session/update` reading, `session/cancel`. It emits typed
Tauri events filtered by session ID. The renderer never imports
`@agentclientprotocol/sdk` — it only calls Tauri commands and listens for
events. This respects the ACP skill's "host is deterministic" principle from
day one and avoids throwaway renderer-side protocol code.

The `@agentclientprotocol/sdk@1.2.1` dependency in `apps/desktop/package.json`
becomes unused by this story; remove it once the Rust side is wired.

### Runtime path: useExternalStoreRuntime

The renderer uses assistant-ui's `useExternalStoreRuntime` directly. The
adapter owns `messages` state, `onNew(message)` sends a Tauri command to
prompt the agent, and incoming Tauri events (`agent://session-update`) append
to / update the assistant message.

Rationale:

1. ACP in Rust means the renderer talks to an agent process, not an LLM
   provider. There is no transport/provider-abstraction layer in the
   renderer.
2. ACP `session/update` has `Plan`, `AvailableCommandsUpdate`,
   `CurrentModeUpdate`, `ConfigOptionUpdate`, `SessionInfoUpdate`,
   `UsageUpdate`, `ToolCallUpdate`, and `request_permission`.
   `useExternalStoreRuntime` models these as first-class `ThreadMessageLike`
   parts.
3. An ACP session is server-side state owned by the agent.
   `useExternalStoreRuntime` lets the renderer reflect that state without
   claiming ownership of message history.
4. Fewer layers: ACP event → Tauri event → `ThreadMessageLike` directly.

### Process spawning: custom Rust commands (not tauri-plugin-shell)

`tauri-plugin-shell` grants arbitrary command execution — the opposite of
AGENTS.md's capability-based sandbox. Custom `agent_spawn`/`agent_prompt`/
`agent_cancel` commands only spawn preconfigured agent binaries from the
registry. This is a new privileged native capability, surfaced here per the
"architectural decisions" rule.

### Agent autodetection

Detect installed agents by probing PATH: `mistral`, `devin`, `codex`,
`cursor`. Default to Mistral Vibe (`mistral vibe --acp`) — ACP by default.
Devin also supports ACP by default. Cursor and Codex typically require an
extension; the registry records that so the UI prompts instead of silently
failing. Detection is best-effort and non-blocking.

## Acceptance Criteria

- [ ] `agentRegistry.ts` detects installed agents by probing PATH, records
      their ACP invocation commands and whether ACP is default or
      extension-required, defaults to Mistral Vibe when present.
- [ ] Rust `agent-client-protocol` crate integrated into `src-tauri`. Owns
      `initialize`, `session/new` (cwd = active workspace root),
      `session/prompt` (last user message as `ContentBlock::Text`),
      `session/update` reading until stop, `session/cancel`. Emits typed
      Tauri events filtered by session ID.
- [ ] Tauri commands `agent_spawn`, `agent_prompt`, `agent_cancel` registered
      in `src-tauri/capabilities/` with narrow scope. No arbitrary command
      execution exposed. Spawns only registry-configured agent binaries.
- [ ] `acpThreadAdapter.ts` uses `useExternalStoreRuntime` from
      `@assistant-ui/react`. `onNew` calls a Tauri `agent_prompt` command.
      Incoming `agent://session-update` events update the assistant message
      in place. `AgentMessageChunk` text appends to a text part;
      `session/update` stop ends the run. Non-text update types ignored in
      MVP (logged, not rendered). Does NOT import `@agentclientprotocol/sdk`.
- [ ] `AssistantPanel.tsx` uses the `useExternalStoreRuntime` adapter →
      `AssistantRuntimeProvider`. Composer input enabled when an agent is
      detected; disabled with a clear message when none is found. Existing
      visual layout preserved.
- [ ] Session IDs explicit and persisted in OS app-data (not the vault). One
      UI thread maps to one ACP session.
- [ ] No provider credentials reach the renderer. The agent process owns its
      own auth; the host only transports NDJSON.
- [ ] `@agentclientprotocol/sdk` removed from `apps/desktop/package.json`
      once the Rust side is wired.
- [ ] Tests cover: agent registry detection, adapter text streaming
      (normal/cancel/error), session filtering. Mock agent in tests — no
      real process spawning in CI.

## Out of Scope

- Tool call rendering, `session/request_permission` UI, plan rendering, MCP
  server configuration UI (`pending-acp_capabilities_and_permissions`).
- Provider/model configuration and native model gateway
  (`pending-provider_configuration_and_gateway`).
- Thread history persistence beyond session ID
  (`pending-assistant_ui_desktop_thread`).
- Context-aware chat (`pending-context_aware_chat`).

## References

- `plans/wip-ai-low-hard.md` — AI epic and architecture decisions
- `.agents/skills/acp/SKILL.md` — ACP integration guidance
- `apps/desktop/src/agent/AssistantPanel.tsx` — current panel (visual done)
- `apps/desktop/src/native/commands.ts` — existing Tauri command pattern
- `apps/desktop/src-tauri/src/lib.rs` — existing Rust command registrations
- `apps/desktop/src-tauri/capabilities/default.json` — capability config
- ACP Rust SDK: https://github.com/agentclientprotocol/rust-sdk
- ACP spec: https://agentclientprotocol.com
- assistant-ui external store docs:
  https://www.assistant-ui.com/docs/runtimes/external-store
