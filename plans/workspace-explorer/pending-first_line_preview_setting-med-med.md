# Explorer First-Line Preview Setting

**Status:** ⬜ pending · **Urgency:** med · **Difficulty:** med

Setting to show the first line of every file under its name in the file
explorer. Must lazy-load: workspaces may hold ~1000 notes, flat or nested
(usually a few dozen). Only fetch previews for visible rows, cache them,
and skip directories of binaries.

## Shape

- New setting (e.g. `explorer.showFirstLine`); off by default?
- Preview provider: read first non-empty line (skip frontmatter?) — decide
  frontmatter handling in the mockup pass.
- Lazy loading keyed to tree visibility/virtualization, not folder
  expansion — expanded-but-offscreen rows should not fetch.
- Cache per workspace, invalidate on note-change events already consumed
  by `subscribeExplorerToNoteChanges`.
- **Needs low-fi mockup first** to pick appearance: second line under the
  filename vs trailing inline preview, truncation, icon alignment, row
  height impact on the tree.
