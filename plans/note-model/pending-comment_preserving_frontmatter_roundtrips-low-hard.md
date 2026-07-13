# Comment-Preserving Frontmatter Round-Trips

## Goal

When the app serializes a note, preserve original YAML formatting and comments
in frontmatter rather than re-stringifying from the parsed value tree. Today
`serializeFrontmatter` re-stringifies via `yaml.stringify`, which drops
comments and normalizes formatting. This is fine under the "no rewrite on
open/index" policy but loses user-authored comments on explicit saves.

Tracks open item OI-001.

## Acceptance Criteria

- [ ] Saving a note preserves YAML comments present in the original frontmatter.
- [ ] Original formatting (indentation, quote style, key order) is preserved on
      round-trip when no field values changed.
- [ ] When a known field changes (e.g. `updated_at`), only that field is
      rewritten; comments and other fields keep their original text.
- [ ] Approach edits the YAML AST in place rather than re-stringifying the
      whole document (e.g. `yaml` `parseDocument` + targeted node mutation).
- [ ] Malformed frontmatter still falls back safely without rewriting the file.
- [ ] Tests cover: comment preservation, key-order preservation, partial
      field update, and malformed-input fallback.

## References

- `packages/core/src/frontmatter.ts` — `parseFrontmatter`, `serializeFrontmatter`, `serializeNote`
- `packages/core/src/note-model.ts` — `NoteMetadata`, `SerializableNote`
- `plans/archive/old-structure/open-items.md` — OI-001
- `plans/archive/old-structure/architecture/notes.md` — mutation policy, unknown-field preservation
