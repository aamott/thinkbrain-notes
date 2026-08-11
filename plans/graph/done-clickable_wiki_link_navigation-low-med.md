# Clickable Wiki-Link Navigation

## Goal

Make `[[Target]]` wiki links in the live preview editor clickable so that activating one opens the target note. Resolved links are visually distinguished from unresolved (broken) links.

## Dependencies

- Link target resolution (`pending-link_target_resolution-low-med.md`) — ✅ done
- The live preview wiki-link decoration in `apps/desktop/src/tabs/livePreview/nodes/links.ts` already renders `[[Target]]` with `cm-link-text` styling but explicitly does not follow links (see the comment at line 16).

## Acceptance Criteria

- [x] Clicking (or Ctrl/Cmd+clicking) a resolved `[[Target]]` in the editor opens the target note via the same path as selecting a file in the explorer.
- [x] Unresolved links (target does not match any note) are visually distinct from resolved links (e.g. `cm-link-broken` class) and are not clickable.
- [x] The resolver (`resolveWikiLinkTarget`) is used to map the target string to a note path at click time, using the current vault's note index.
- [x] The editor receives an `onOpenNote(relativePath)` callback from the shell so it can request navigation without knowing about the workspace.
- [x] A note index (filenames, titles, aliases) is available to the editor at runtime — either passed in as a prop or read from a store.
- [x] Tests cover the click handler and the resolved/unresolved visual distinction.

## References

- `packages/core/src/linkResolver.ts` — `resolveWikiLinkTarget`, `NoteIndexEntry`
- `apps/desktop/src/tabs/livePreview/nodes/links.ts` — `wikiLink` node handler (decoration only, no click)
- `apps/desktop/src/tabs/MarkdownEditor.tsx` — editor component, receives props from the shell
- `apps/desktop/src/shell/DesktopShell.tsx` — `openMarkdownDocument` callback
