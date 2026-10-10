# Graph — Completed Work

Five stories shipped, forming the wiki-link foundation and its first
user-facing reverse-link inspector.

- `link_target_resolution` — shared resolver in
  `packages/core/src/linkResolver.ts` maps `[[Target]]` to notes by filename,
  frontmatter `title`, `aliases`, or relative path. Case-insensitive,
  `.md`-agnostic, deterministic tie-breaks; unresolved links tracked, not
  thrown.
- `wiki_link_index` — reverse index in `packages/core/src/wikiLinkIndex.ts`
  mapping targets → referencing notes. Rebuilt on workspace open, updated
  incrementally on `note.saved/created/renamed/deleted`.
- `wiki_link_autocomplete` — typing `[[` triggers a CodeMirror picker
  filtering by filename, title, or alias; debounced/cached for large vaults.
- `clickable_wiki_link_navigation` — `[[Target]]` links in live preview open
  the resolved note; unresolved links get `cm-link-broken` styling.
- `backlinks_panel` — shared desktop/mobile inspector derived from the
  in-memory wiki-link index: source note + exact link line, live updates,
  canonical tab reuse, phone history, loading/error/empty states.
