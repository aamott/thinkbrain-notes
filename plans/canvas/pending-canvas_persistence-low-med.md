# Canvas Persistence

## Goal

Load and save canvas documents as `.canvas` JSON files in the vault, using a
schema compatible with the Obsidian Canvas format for interoperability. The
file is the source of truth — no database or sidecar.

## Acceptance Criteria

- [ ] `.canvas` files are recognized as canvas documents by the file explorer
      and app routing.
- [ ] Loading a `.canvas` file parses JSON into the canvas document model.
- [ ] Saving serializes the model back to the `.canvas` JSON schema.
- [ ] Malformed `.canvas` files fail loudly with a useful error and do not
      corrupt the file.
- [ ] Schema matches Obsidian Canvas format (nodes, edges, positions, sizes)
      where practical; app-specific extensions are additive and ignored by
      Obsidian.
- [ ] Canvas files live in the vault (user data) and are Git-friendly.
- [ ] Tests cover load, save, round-trip, and malformed-input handling.

## References

- `packages/core/src/` — canvas persistence (e.g. `canvas-io.ts`)
- `packages/core/src/note-model.ts` — note path resolution patterns
- `plans/canvas.md` — persistence architecture decision
