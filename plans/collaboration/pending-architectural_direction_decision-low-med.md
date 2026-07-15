# Architectural Direction: Local-First Collaboration Design

## Goal

Flesh out the decided direction — local-first, opt-in, P2P-preferred — into a
concrete design that can guide implementation. The direction is decided (see
`plans/collaboration.md` Architecture Decisions). This story produces the
detailed design document, not code.

## Acceptance Criteria

- [ ] Written design covering: P2P (WebRTC + CRDT) as the primary transport,
      self-hosted relay as fallback for signaling, opt-in per-workspace mode.
- [ ] Design documents how collaboration state is kept out of the vault and
      SQLite cache (user-data separation).
- [ ] Design confirms single-user local-first mode is the default and is
      unaffected by the collaboration feature.
- [ ] Design updates `plans/collaboration.md` and `plans/technical-decisions.md`
      if cross-cutting.
- [ ] Any backend/relay dependency is optional and never required for single-user
      use.
- [ ] If the design reveals that collaboration cannot work within the
      local-first constraints, document why and recommend deferring the epic.

## References

- `plans/app-vision.md` — Core Principles (Local First, Bring your own sync,
  Privacy), "Not an epic: Sync" note
- `.agents/AGENTS.md` — "Bring your own sync", user-data separation rules
- `plans/collaboration.md` — Architecture Decisions (direction decided)
- `plans/technical-decisions.md` — cross-cutting decisions
