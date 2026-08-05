# Shared-Workspace Sessions

## Goal

Allow a user to start a collaboration session for a workspace, invite
collaborators, and let them join and leave. Session lifecycle (start, persist,
resume, end) is defined.

## Acceptance Criteria

- [ ] User can start and end a collaboration session for the active workspace.
- [ ] Collaborators can join via an invite mechanism (link/code, per the
      chosen transport architecture).
- [ ] Session can be resumed after a disconnect.
- [ ] Session state (active peers, shared workspace identity) is ephemeral /
      app-data only — never in the vault.
- [ ] Starting a session does not modify workspace files.

## References

- `plans/wip-collaboration-low-hard.md` — session lifecycle, transport abstraction
- `plans/collaboration/pending-architectural_direction_decision-low-med.md`
