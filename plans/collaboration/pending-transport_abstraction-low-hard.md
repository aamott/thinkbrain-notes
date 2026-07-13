# Transport Abstraction in packages/core

## Goal

Provide a swappable transport layer in `packages/core` for collaboration,
abstracting over the chosen backend(s) (P2P WebRTC, user-hosted relay, etc.)
so the UI and CRDT layer never depend on a specific transport.

## Acceptance Criteria

- [ ] Transport interface defined in `packages/core` (connect, disconnect,
      send, receive, presence broadcast).
- [ ] At least one backend implementation behind the interface.
- [ ] Transport is only instantiated when a collaboration session is active.
- [ ] No transport code is imported in single-user / default mode.
- [ ] Tests cover message round-trip and peer connect/disconnect.

## References

- `packages/core/` — platform-agnostic logic (hub and spoke)
- `plans/collaboration.md` — transport abstraction
- `plans/collaboration/pending-architectural_direction_decision-low-med.md`
