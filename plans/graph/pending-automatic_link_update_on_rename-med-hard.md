# Automatic Link Update on Rename

## Goal

When a note is renamed or moved, every `[[Target]]` in other notes that pointed at the old name is updated to point at the new name. This keeps the vault's link graph intact without manual editing.

## Dependencies

- Link target resolution — ✅ done, see `plans/graph/done-summary.md`
- Wiki-link index — ✅ done, see `plans/graph/done-summary.md`; used to find which notes reference the renamed note
- `note.renamed` event — ✅ emitted from `workspaceAdapter.ts`

## Acceptance Criteria

- [ ] On a `note.renamed` event, the system finds all notes whose wiki links resolved to the old path.
- [ ] For each linking note, the raw `[[old target]]` text in the file is rewritten to `[[new target]]` and the file is saved.
- [ ] Links that referenced the note by alias or title (not by filename) are updated only if the rename changed the matching property. If the note's title/alias is unchanged, links by title/alias do not need rewriting.
- [ ] The rewrite preserves display text (`[[Old|My Text]]` → `[[New|My Text]]`) and only changes the target portion.
- [ ] Links inside the renamed note itself are not affected (they point at other notes).
- [ ] The update is resilient: if a linking note is open in an editor tab, the editor content is refreshed after the rewrite (not silently overwritten).
- [ ] Failures to rewrite a single linking note are logged and do not abort the rest of the updates.
- [ ] Tests cover: rename by filename, rename preserving title, display text preservation, open-editor refresh, partial failure handling.

## References

- `packages/core/src/linkResolver.ts` — `resolveWikiLinkTarget`
- `packages/core/src/markdown.ts` — `extractWikiLinks`
- `apps/desktop/src/events/appEvents.ts` — `note.renamed` event
- `apps/desktop/src/workspace/workspaceAdapter.ts` — emits `note.renamed`
- `apps/desktop/src/workspace/workspaceDocumentAdapter.ts` — `writeMarkdownDocument`
