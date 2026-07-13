# Mobile Markdown Editor Surface

## Goal

Provide a Markdown editor surface on mobile. CodeMirror 6 is a DOM-based editor
and does not run in React Native — the mobile app needs a native-compatible
editing surface (e.g. a React Native text input with Markdown rendering, or a
wrapped native editor). Decide the approach in this story.

## Acceptance Criteria

- [ ] Markdown editing works on mobile with responsive, touch-friendly input.
- [ ] Note content loads from and saves to the workspace via the mobile
      FileSystem adapter.
- [ ] Frontmatter is preserved per the shared core mutation policy (opening or
      indexing never rewrites the file).
- [ ] Editor approach decision is documented in the epic Status section
      (e.g. plain TextInput + rendered preview, wrapped native editor, or other).
- [ ] No DOM or CodeMirror dependency leaks into the mobile bundle.

## References

- `packages/core/src/markdown.ts` — shared Markdown parsing
- `packages/core/src/note-model.ts` — note metadata and serialization
- `plans/technical-decisions.md` — Editor section (CodeMirror is desktop-only)
- `plans/note-model.md` — frontmatter mutation policy
- `plans/mobile.md` — epic
