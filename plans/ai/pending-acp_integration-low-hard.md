# ACP Host Integration

## Goal

Implement the app as an Agent Client Protocol (ACP) **host**: session
lifecycle, capability exposure (filesystem, terminal, permissions), and
streaming output. The host stays deterministic and never duplicates agent
reasoning, planning, or editing logic.

Prefer official ACP SDKs over hand-rolled transport. See the ACP skill and the
spec before implementing protocol behavior.

## Acceptance Criteria

- [ ] ACP session lifecycle (start, prompt, stream, end) is implemented behind
      a core interface.
- [ ] Host exposes filesystem capabilities (read/write/rename/delete) through
      ACP, scoped to the active workspace.
- [ ] Host exposes terminal capabilities with streamed stdout/stderr.
- [ ] Permission model implemented: agent requests permission, host shows UI,
      user decides (allow once / always allow / deny), host enforces.
- [ ] Stale-write / conflict handling returns current content and lets the
      agent retry; host does not merge.
- [ ] No agent-specific reasoning logic lives in the host.
- [ ] Tests cover session lifecycle and permission decisions (mocked agent).

## References

- `.agents/skills/acp/SKILL.md` — ACP responsibilities, host/agent boundary
- ACP spec: https://github.com/zed-industries/agent-client-protocol
- `plans/ai.md` — architecture decisions (ACP is the integration mechanism)
- Prerequisite: `extensions` epic active; provider abstraction story
  recommended first.
