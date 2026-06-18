# MVP Scope

This document defines the first shippable desktop MVP. Anything outside this file is not part of MVP unless a work item explicitly includes it.

## MVP Goal

Build a fast, local-first desktop Markdown workspace where a user can open a folder, browse notes, edit Markdown files, search notes, configure basic settings, and perform basic Git operations.

## In Scope

- Desktop app using Tauri, React, TypeScript, and Vite
- Workspace folder opening
- File explorer for Markdown files
- Create, rename, delete, read, and write Markdown files
- Markdown editor using CodeMirror 6
- Plain Markdown persistence
- YAML frontmatter parsing
- Tags and aliases parsing from frontmatter/content
- Wiki-link parsing for future backlinks/graph support
- Basic full-text search over Markdown files
- JSON application and workspace settings
- Basic Git integration using system Git:
  - repository detection
  - status
  - stage/unstage
  - commit
  - branch list
  - repository initialization
- Built-in theme foundation using CSS variables
- Test, lint, typecheck, and build commands

## Explicitly Out of Scope

- Mobile app
- Cloud sync
- Conflict-resolution UI
- AI assistant
- AI provider abstraction
- Embeddings
- Semantic search
- Extension marketplace
- Third-party extension execution
- Public plugin API
- Graph view
- Canvas
- Collaboration
- Publishing
- Auto-updater
- Custom sync service
- Embedded Git implementation

## MVP Quality Bar

- User files remain normal Markdown files.
- The app must work offline.
- The editor should open quickly even if indexing is still running.
- Search/index data must be rebuildable from disk.
- App caches must not be stored inside the workspace.
- Errors should fail loudly with useful messages.
- Core functionality should be covered by tests where practical.
