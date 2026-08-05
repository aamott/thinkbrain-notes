# WorkspaceTree Keyboard Navigation Incomplete

**Urgency:** Medium
**Difficulty:** Hard

In `apps/desktop/src/workspace/WorkspaceExplorer.tsx`, the `WorkspaceTreeItem` component's `handleKeyDown` supports `ArrowRight` and `ArrowLeft` for expanding/collapsing folders and traversing the tree. However, it lacks standard keyboard bindings like `Enter` and `Space` to toggle folders or open Markdown files when navigating the tree via keyboard.

## Action Item
- Extend the `handleKeyDown` switch statement in `WorkspaceTreeItem` to support `Enter` and `Space`.
- Pressing `Enter` or `Space` on a focused item should toggle its expansion state if it's a directory, or open the file if it's a markdown file (calling `onToggleFolder` or `onMarkdownFileSelected`).
