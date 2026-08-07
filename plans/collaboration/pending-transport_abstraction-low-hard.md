# Transport Abstraction in packages/core

## Goal

Define platform-neutral collaboration transport interfaces in `packages/core`,
so the UI and CRDT layer never depend on a specific transport. Core owns contracts
only; WebRTC, relay, signaling, native, and other network implementations belong
behind desktop/Tauri adapters.

## Acceptance Criteria

- [ ] Platform-neutral transport interfaces are defined in `packages/core` for
      connect, disconnect, send, receive, and presence broadcast; core contains
      no WebRTC, relay, signaling, native, socket, or other network implementation.
- [ ] The contract supports dependency-injected implementations, cancellation, and
      unavailable/error mapping without choosing WebRTC, relay, or signaling here.
- [ ] Core tests cover interface behavior with fakes and prove no platform/network
      dependencies enter `packages/core`.
- [ ] Concrete transport selection/implementation remains blocked on the architectural
      direction decision and must live behind desktop/Tauri adapters.

## References

- `packages/core/` — platform-agnostic logic (hub and spoke)
- `plans/wip-collaboration-low-hard.md` — transport abstraction
- `plans/collaboration/pending-architectural_direction_decision-low-med.md`
