# Real-Time Co-Editing in the CodeMirror 6 Editor

## Goal

Bind the CRDT merge layer to the CodeMirror 6 editor so multiple users can edit
the same note simultaneously and see each other's changes live.

## Acceptance Criteria

- [ ] Local edits are applied to the CRDT document and broadcast to peers.
- [ ] Remote edits are applied to the CodeMirror document without disrupting
      the local user's cursor or in-progress edits.
- [ ] Co-editing works only in an explicitly enabled collaboration session;
      normal editing is unaffected when no session is active.
- [ ] Editor performance remains acceptable with multiple concurrent peers.
- [ ] Tests cover remote-edit application and cursor preservation.

## References

- `apps/desktop/src/editor/` — CodeMirror 6 editor integration
- `plans/collaboration/pending-crdt_merge_layer-low-hard.md`
- `plans/collaboration.md` — CodeMirror 6 collaboration bindings
