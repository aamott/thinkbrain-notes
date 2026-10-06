# Selective Restore Editor

Depends on: `restore_workflow`

## Goal

Add an optional full-screen restore workspace where users can apply individual
historical changes, edit the result directly, and save it like a normal file.

## Scope

Keep the fast `Restore this version` action. Add `Customize restore` for the
editable workflow. Move restore context and actions into the ordinary workspace
header, seed an editable result from the current file, and let users bring
selected changes from the recorded source into that result in split or inline
mode.

Out of scope: replacing ordinary file editing, three-way merge-base selection,
multi-file cherry-picking, and exposing Git commits or staging concepts.

## Architecture Decisions

- The read-only full restore remains available and keeps its current-to-recorded
  operation semantics.
- Customize Restore has three roles: immutable current baseline, immutable
  recorded source, and editable result initially equal to current.
- Split and inline are presentations of the same tab-owned draft. Switching
  layout or application tabs never resets edits.
- The result is a real dirty tab document with ordinary save/close protection.
- Saving uses the stale-current guard, checkpoints the current file, writes the
  complete result, and records typed selective-restore provenance.

## Status

- ⬜ pending — move restore chrome into the shared workspace header
- ⬜ pending — introduce a persistent editable restore draft
- ⬜ pending — apply individual recorded changes in split and inline layouts
- ⬜ pending — save the customized result safely and record provenance
- ⬜ pending — verify responsive, keyboard, and accessibility behavior
