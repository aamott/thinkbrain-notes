# Permission Model

## Goal

Define and enforce permissions within a collaboration session: who can edit vs.
read-only, scoped per-workspace or per-file as appropriate.

## Acceptance Criteria

- [ ] Session owner can grant read-only or edit permissions per collaborator.
- [ ] Read-only collaborators cannot mutate the CRDT document.
- [ ] Permission changes take effect live without rejoining the session.
- [ ] Permissions are session-scoped and not persisted to the vault.
- [ ] Tests cover permission enforcement for edit and read-only peers.

## References

- `plans/wip-collaboration-low-hard.md` — permission model
- `plans/collaboration/pending-shared_workspace_sessions-low-med.md`
