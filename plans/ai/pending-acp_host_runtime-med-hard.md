# ACP Host and Session Lifecycle

## Status

⬜ Native host story. Depends on agent registry and contracts; permissions/capabilities are deliberately separate.

## Goal

Implement a deterministic ACP client in Rust using the official `agent-client-protocol` crate. Own process transport, initialize/session lifecycle, streaming updates, cancellation, resume/close, and typed Tauri events without planner, editor, merge, or permission decisions.

## Exact likely files

- `apps/desktop/src-tauri/Cargo.toml` and `Cargo.lock` — pin/record the verified official crate version and transport features.
- `apps/desktop/src-tauri/src/ai/acp.rs` — ACP client, JSON-RPC transport, session state, cancellation, sequence assignment.
- `apps/desktop/src-tauri/src/ai/acp_types.rs` — renderer DTOs and redaction mapping, not a second ACP schema.
- `apps/desktop/src-tauri/src/commands/acp.rs` — `agent_list_available`, `agent_spawn`, `agent_session_new`, `agent_prompt`, `agent_cancel`, `agent_session_close` handlers.
- `apps/desktop/src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json` — explicit command registration/capabilities.
- `apps/desktop/src-tauri/src/tests.rs` or `src/ai/acp_tests.rs` — mock-agent contract tests.
- `apps/desktop/src/native/acp.ts`, `src/native/commands.ts` — typed renderer adapter; no ACP SDK.

## Rust/frontend contracts and event names

Lifecycle: `agent_spawn` selects an allowlisted `agentId`; host performs ACP `initialize`, then `session/new` with active workspace cwd; `agent_prompt` maps the submitted text to ACP `session/prompt`; host reads `session/update` until stop; `agent_cancel` maps to `session/cancel`; close terminates transport and removes session state. Resume/load must use an existing persisted opaque ACP session link only when the agent supports it; otherwise return typed `session_resume_unsupported`.

Events: `agent://session-update` carries `{sessionId, requestId, sequence, update}`; `agent://session-state` carries `{sessionId, state: "starting"|"ready"|"prompting"|"cancelling"|"closed"|"failed", reason?}`; `agent://error` carries `{sessionId, requestId?, code, message, retryable}`. Payloads are DTOs with no env, auth, raw command line, or secret. Events are emitted only to the matching Tauri app/session and sequence is monotonic/replay-safe.

Use ACP crate/schema types for protocol messages and query the current official spec before coding permission-related methods. If the crate lacks a needed host feature, implement only the minimum official schema surface and document the gap; never invent a proprietary wire protocol.

## Dependencies and order

1. Existing Rust/Tauri command conventions and `pending-ai_contracts_and_consent`.
2. Agent registry allowlist.
3. Verify current ACP crate/spec/API and mock-agent fixture.
4. Host commands/events.
5. Text-stream renderer story consumes the DTOs.
6. Capability/permission story adds client-mediated filesystem/terminal requests later.

## Tests

Mock ACP agent tests cover initialize negotiation/version incompatibility, session/new cwd, prompt text block, multiple deltas/stop, cancel acknowledgement, disconnect, malformed/unknown update, duplicate session ID, close cleanup, resume unsupported, and event session filtering. Assert host never plans, edits, merges, or auto-approves. Add command tests rejecting arbitrary executable/args and workspace paths outside the active root.

## Manual checks

Use a small local mock ACP agent and one real allowlisted agent. Verify start/ready, multiple prompts, stream, cancel, disconnect/reconnect state, close, and workspace cwd. Inspect Tauri events/logs for redaction. Verify no `tauri-plugin-shell` or renderer ACP SDK path is used.

## Consent, local/cloud, and mobile constraints

Agent auth and any remote agent network are agent-owned; the host does not infer consent from local process presence. Filesystem/terminal operations must wait for the separate ACP permission story. On mobile, process spawning/PTY/background execution may be unavailable; return typed unavailable state and do not pretend PATH-based desktop agents exist.

## Acceptance criteria

- [ ] Official ACP initialization/session/prompt/update/cancel/close flow is typed, deterministic, redacted, and session-filtered.
- [ ] Allowlisted agent/workspace inputs only; no arbitrary executable/args, planner, editor, merge, or auto-approval behavior.
- [ ] Cleanup, disconnect, cancellation, resume-unsupported, and mobile-unavailable states are explicit.

## Automated validation

Run Rust mock-agent/command tests for negotiation, deltas/stop, cancel, disconnect, filtering, cleanup, redaction, and path validation; run `cargo test`, `pnpm lint`, and `pnpm typecheck`.

## Manual desktop/mobile checks

Desktop: use mock and approved local agent for start/stream/cancel/reconnect/close and inspect redacted events. Mobile: verify typed unavailable state and no PATH/PTY assumption.

## Non-goals

No provider/model gateway, secret-store implementation, permission policy, tool execution, filesystem/terminal adapter, UI mockup, history persistence, context injection, host-side planner/merge, or extension installation.

## Handoff expectations

Deliver verified ACP crate/spec note, DTO/event contract, mock-agent tests, lifecycle cleanup report, redaction/platform matrix, and unresolved protocol questions.
