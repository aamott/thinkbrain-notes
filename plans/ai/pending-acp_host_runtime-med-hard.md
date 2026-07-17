# ACP Host Runtime

## Goal

Implement the deterministic ACP host lifecycle at the Rust/Tauri capability
boundary using the official runtime, and link explicit agent sessions to the
assistant UI without conflating them with model-chat streams.

## Acceptance Criteria

- [ ] Validate the official `agent-client-protocol` Rust runtime against the
      app's Tauri/process model and record the selected version/capability
      negotiation behavior; use its schema/runtime rather than hand-rolled ACP.
- [ ] Host starts, initializes, prompts, cancels, resumes, and closes ACP
      sessions with negotiated protocol/capabilities and structured lifecycle
      events.
- [ ] One user-created Agent session maps to one ACP session; its UI thread is
      linked by metadata but retains ACP event/message semantics.
- [ ] Renderer-facing events are typed, session-filtered, replay-safe, and
      redact secrets; the host owns no planner, editor, or merge behavior.
- [ ] Mock-agent contract tests cover initialization negotiation, lifecycle,
      progress/output streaming, cancel, disconnect, and incompatible versions.

## References

- `.agents/skills/acp/SKILL.md`
- ACP project: https://github.com/agentclientprotocol/agent-client-protocol
- `apps/desktop/src-tauri/src/`
- `plans/ai.md`
