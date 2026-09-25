# Explorer drag-and-drop move

## Goal

Move files and folders between Explorer directories, including back to the
workspace root, with mouse, touch, and keyboard input. Preserve open tabs and
derived indexes when a whole folder changes path.

## Architecture

- Keep `rename_workspace_entry` as the one filesystem operation. Return a
  `WorkspaceRenameResult` containing the moved root entry plus every descendant
  file's old/new path and Markdown classification.
- Add an explicit native descendant-cycle guard before `fs::rename`; retain the
  existing containment, missing-source, collision, no-op, and mutation-lock
  behavior.
- `workspaceAdapter` unwraps the moved entry and publishes one event per moved
  file: `note.renamed` for Markdown and `file.renamed` for other files. Search
  and wiki-link indexes continue consuming note events; open document/media
  tabs consume both event types and retarget without losing unsaved contents.
- Add a focused pointer/keyboard drag controller rather than growing
  `WorkspaceExplorer.tsx` past 800 lines. Mouse/pen may begin from the row after
  a movement threshold, and a floating preview follows the pointer.
- Coarse-pointer rows use delayed Touch Events: an immediate swipe scrolls, a
  hold followed by movement drags, and a stationary held release opens the
  row context menu. The dedicated `touch-none` handle remains a direct touch
  and keyboard affordance.
- Valid destinations are existing folders and the workspace root. A file row
  is never an implicit destination. Hovering a collapsed folder expands it
  after a short delay; edge proximity auto-scrolls the tree.
- Keyboard interaction on the drag handle uses Enter/Space to pick up/drop,
  Arrow keys to cycle valid root/folder destinations, and Escape to cancel.
  An `aria-live` status announces pickup, destination, rejection, success, and
  cancellation.
- Explorer refreshes through `runWithRefresh`, remaps active/expanded paths by
  prefix, and keeps the moved row active. A same-parent drop is a no-op.

## Acceptance criteria

- A file or folder can move into an existing folder or back to workspace root
  by whole-row pointer drag, coarse-pointer hold/handle drag, and keyboard.
- Folder moves preserve all descendants and automatically expand a collapsed
  destination after hover.
- The current drop target and invalid targets have clear token-based visual
  states; cancellation restores the unchanged tree.
- Existing destination collisions fail clearly without overwrite.
- Moving a folder into itself or a descendant is rejected before filesystem
  mutation with a user-friendly error.
- Moving a Markdown file or folder retargets every affected open tab and
  updates search/wiki-link records from old paths to new paths.
- Moving non-Markdown files retargets open text/media tabs without emitting
  note lifecycle events or touching note indexes.
- Dirty editor contents survive retargeting, expanded descendant folders and
  the active row follow the moved prefix, and workspace switches cancel an
  active drag or stale move completion.
- Pointer capture, threshold, touch scrolling, auto-expand, auto-scroll,
  keyboard announcements, root drops, no-op drops, failures, and recursive
  event mappings have focused tests.
- Desktop and Android smoke tests pass, followed by full `pnpm qa`.

## File references

- `apps/desktop/src/workspace/WorkspaceTree.tsx`
- `apps/desktop/src/workspace/WorkspaceExplorerView.tsx`
- `apps/desktop/src/workspace/WorkspaceExplorer.tsx`
- `apps/desktop/src/workspace/workspaceExplorerTypes.ts`
- `apps/desktop/src/workspace/workspaceAdapter.ts`
- `apps/desktop/src/events/appEvents.ts`
- `apps/desktop/src/events/noteChangeSubscription.ts`
- `apps/desktop/src/shell/useExternalDocumentSync.ts`
- `apps/desktop/src/native/commands.ts`
- `apps/desktop/src-tauri/src/commands/workspace_entries.rs`
- `apps/desktop/src-tauri/src/tests/workspace_markdown.rs`
