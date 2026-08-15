# Graph Epic — Completed Work

Four stories shipped, forming the wiki-link foundation that backlinks and graph view will build on.

## Link Target Resolution
Shared platform-agnostic resolver mapping `[[Target]]` strings to notes by filename, frontmatter `title`, `aliases`, or relative path. Case-insensitive, `.md`-agnostic, deterministic tie-breaks, unresolved links tracked not thrown.
- `packages/core/src/linkResolver.ts` — `resolveWikiLinkTarget`, `NoteIndexEntry`

## Wiki-Link Index
Reverse index mapping each note's `relativePath` to its wiki-link targets, and resolved targets back to referencing notes. Rebuilt on workspace open, updated incrementally on `note.saved/created/renamed/deleted`. Lives in `packages/core` as pure data; desktop provides event wiring.
- `packages/core/src/wikiLinkIndex.ts`

## Wiki-Link Autocomplete
Typing `[[` in the editor triggers a CodeMirror autocomplete popup filtering by filename, title, or aliases. Inserts `[[Target]]` on select. Debounced/cached for large vaults.
- `apps/desktop/src/tabs/markdownEditorHooks.ts` — autocomplete registration

## Clickable Wiki-Link Navigation
`[[Target]]` links in live preview are clickable; resolved links open the target note, unresolved links get `cm-link-broken` styling and are not clickable. Editor receives `onOpenNote(relativePath)` from the shell.
- `apps/desktop/src/tabs/livePreview/nodes/links.ts` — decoration + click
- `apps/desktop/src/shell/DesktopShell.tsx` — `openMarkdownDocument` callback
