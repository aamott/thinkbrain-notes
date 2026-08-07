# Canvas Persistence

## Goal

Load and save user-owned canvas documents as `.canvas` JSON files in the vault,
using a schema compatible with the Obsidian Canvas format for interoperability.
The file is the source of truth for document structure — no database or sidecar;
settings, cache, and viewport/session state remain outside the vault. Edits are
debounced/batched and written atomically.

## Acceptance Criteria

- [ ] `.canvas` files are recognized as canvas documents by the file explorer
      and app routing.
- [ ] Loading a `.canvas` file parses JSON into the canvas document model.
- [ ] Saving serializes the model back to the `.canvas` JSON schema using
      debounced/batched, atomic writes.
- [ ] Malformed `.canvas` files fail loudly with a useful error and do not
      corrupt the file.
- [ ] External changes are detected before a pending save; local edits are never
      silently overwritten.
- [ ] On conflict, both local and external versions are preserved and the user
      can reload or resolve explicitly; structural auto-merge is deferred.
- [ ] Schema matches Obsidian Canvas format (nodes, edges, positions, sizes)
      where practical; app-specific extensions are additive and ignored by
      Obsidian.
- [ ] Canvas files live in the vault (user data) and are Git-friendly.
- [ ] Tests cover load, save, round-trip, and malformed-input handling.

## References

- `packages/core/src/` — canvas persistence (e.g. `canvas-io.ts`)
- `packages/core/src/note-model.ts` — note path resolution patterns
- `plans/pending-canvas-low-hard.md` — persistence architecture decision
