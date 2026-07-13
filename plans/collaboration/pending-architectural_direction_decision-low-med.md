# Architectural Direction: Local-First vs. Collaboration

## Goal

Decide, before any collaboration implementation begins, how real-time
collaboration coexists with the app's local-first / bring-your-own-sync
principles. Real-time co-editing is in direct tension with "no cloud backend"
and "everything works offline." This story is a **decision / design** task, not
code.

## Acceptance Criteria

- [ ] Manager-approved written decision covering: self-hosted relay vs. P2P
      (WebRTC + CRDT) vs. opt-in collaboration mode (or a chosen combination).
- [ ] Decision documents how collaboration state is kept out of the vault and
      SQLite cache (user-data separation).
- [ ] Decision confirms single-user local-first mode is the default and is
      unaffected by the collaboration feature.
- [ ] Decision updates `plans/collaboration.md` Architecture Decisions section
      and `plans/technical-decisions.md` if cross-cutting.
- [ ] Any new backend/relay dependency is optional and never required for
      single-user use.

## References

- `plans/app-vision.md` — Core Principles (Local First, Bring your own sync,
  Privacy), "Not an epic: Sync" note
- `.agents/AGENTS.md` — "Bring your own sync", user-data separation rules
- `plans/collaboration.md` — Architecture Decisions (tension flagged)
- `plans/technical-decisions.md` — cross-cutting decisions
