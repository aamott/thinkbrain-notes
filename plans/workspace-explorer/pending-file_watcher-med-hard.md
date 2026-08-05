# Native File Watcher

## Goal

Ensure the app stays synchronized with external file changes (e.g., when the user edits a markdown file in VS Code or runs a `git pull`). The app must detect these changes and update the UI and index automatically.

## Design

- Use the Rust `notify` crate in the native layer to monitor the active workspace directory for changes.
- The Rust layer emits Tauri events (e.g., `workspace://file-changed`, `workspace://file-added`, `workspace://file-deleted`).
- The frontend `workspaceExplorerModel` listens to these events and applies updates to the tree state without requiring a full reload.
- If an open editor tab represents a file that changed externally, prompt the user to reload it (or auto-reload if unmodified).
- Debounce events heavily, especially for things like `git checkout` which touch many files at once.

## Acceptance Criteria

- [ ] Rust `notify` watcher starts when a workspace is opened.
- [ ] Watcher is dropped when workspace is closed.
- [ ] Events are debounced in Rust before emission.
- [ ] Frontend tree updates automatically on file add/delete/rename.
- [ ] Active editor tab reloads content if file is changed externally.
