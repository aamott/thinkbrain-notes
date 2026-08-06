# Fresh-Shell Markdown CRUD UI

## Goal

Make Markdown notes usable from the fresh desktop workspace: select a Markdown
file in Explorer, open it in a real editor tab, edit and save it through the
native bridge, and create a new Markdown note without restoring any retired
desktop UI code or CSS.

## Acceptance Criteria

- [x] Explorer selects Markdown files and opens or activates the corresponding
      editor tab; non-Markdown entries remain read-only and do not pretend to
      be editable.
- [x] The desktop tab model has deterministic open/select, dirty, save, close,
      and nearest-neighbor transitions, with React components registered only
      in the desktop layer.
- [x] Reading, writing, and creating Markdown documents go through a typed
      workspace adapter; React surfaces never call Tauri `invoke` directly.
- [x] The editor shows loading, saving, and clear recoverable error states;
      unsaved changes are never silently discarded.
- [x] A New Note action creates a Markdown file through the existing native
      command, refreshes Explorer, and opens the new document.
- [x] Unit and browser tests cover opening, editing, saving, creating, and
      dirty-close behavior; lint, typecheck, build, Rust tests, and regular
      desktop launch pass.

## Boundaries

- Build only against the fresh `shell/`, `tabs/`, and `workspace/` directories.
- The retired desktop UI and styles remain deleted and must not be inspected,
  imported, or reused.
- Preserve native Markdown commands; this story composes their UI boundary and
  does not introduce generic non-Markdown mutations.

## Dependencies

- `plans/ui-shell/done-tab_content_registry-high-hard.md`
- `apps/desktop/src/native/commands.ts`
- `apps/desktop/src/workspace/ReadOnlyWorkspaceExplorer.tsx`

## Implementation

The fresh Explorer opens Markdown leaves through a typed workspace-document
adapter and exposes an inline **New note** action. The fresh `tabs/` reducer
owns open/select/dirty/close state, while the shell renders a lazily loaded
CodeMirror Markdown editor with explicit loading, saving, and recoverable error
states. Saving and closing a dirty tab use the native Markdown commands and a
save/discard/cancel decision. Browser coverage exercises the whole native-mock
flow, including document creation and persistence.
