# Graph Epic — Completed Work

Five stories shipped, forming the wiki-link foundation and its first user-facing reverse-link inspector.

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

## Backlinks Inspector
Desktop and mobile share a reactive Backlinks panel derived from the in-memory wiki-link index. Rows show the source note title/path and exact link line; filename/title/alias/path resolution, mutation events, workspace switches, canonical tab reuse, phone history, loading/error/empty states, and touch/accessibility behavior are covered.
- `apps/desktop/src/panels/BacklinksPanel.tsx`
- `apps/desktop/src/wikiLinks/wikiLinkIndexStore.ts`
- `packages/core/src/wikiLinkIndex.ts` — context-bearing reverse records
