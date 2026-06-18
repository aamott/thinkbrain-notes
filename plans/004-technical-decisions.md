# Technical Decisions

This document is the source of truth for cross-cutting implementation decisions.

## Platform

Decision: Build a desktop-first application using Tauri.

- Frontend: React, TypeScript, Vite
- Desktop shell/native bridge: Tauri
- Backend/native code: Rust
- Mobile: deferred to Phase 2

## Repository Structure

Decision: Use a workspace-style repository with a desktop app and shared packages.

Initial target structure:

```text
apps/
  desktop/
    src/
    src-tauri/

packages/
  core/
  ui/
```

Do not split `packages/core` into many packages until the codebase has enough complexity to justify it.

## Package Manager and Build Orchestration

Decision pending: choose between `pnpm` workspaces only or `pnpm` workspaces plus Turborepo.

Until decided, agents should avoid committing to Turborepo-specific assumptions in feature code.

## Editor

Decision: Use CodeMirror 6 directly for the Markdown editor.

Do not use Monaco or `@uiw/react-md-editor` for MVP unless this decision is explicitly changed.

## Storage

Decision: Markdown files are the source of truth.

- Notes are normal `.md` files.
- Metadata uses YAML frontmatter.
- Attachments are normal files referenced by relative paths.
- No proprietary note format is allowed.

## Database and Indexes

Decision: SQLite may be used as a disposable cache for indexing and search.

- SQLite must never be the source of truth.
- The index must be rebuildable from workspace files.
- Database files must be stored in the OS application-data directory, not inside the workspace/vault.

## Search

Decision: MVP search should support Markdown text, filenames, tags, and aliases.

Preferred implementation: SQLite FTS5 if the project scaffold supports it cleanly. If SQLite integration blocks MVP progress, start with a simple file-backed search and preserve the indexing abstraction.

## Git

Decision: Use system Git for MVP.

- Invoke installed Git binaries through the desktop/native layer.
- Do not implement embedded Git for MVP.

## Settings

Decision: Use human-readable JSON settings.

Settings levels:

1. Application settings
2. Workspace settings
3. Extension settings, deferred until extension work exists

## Extensions

Decision: MVP supports internal contribution points only.

Do not build third-party extension execution, install-from-URL, sandboxing, signing, or marketplace features during MVP.

## Themes

Decision: Themes are based on CSS variables.

MVP may include built-in themes and theme tokens. Third-party theme packages are deferred until the extension system exists.

## AI

Decision: AI is deferred beyond MVP.

No AI provider abstraction, model configuration, ACP integration, embeddings, or AI UI should be implemented unless explicitly assigned by a future work item.

## Sync

Decision: Built-in cloud sync is deferred.

The project follows Bring Your Own Sync as a future documented strategy. MVP must avoid storing app caches in the workspace so users can safely use external sync tools.

## Frontmatter Mutation Policy

Decision: Opening, indexing, or searching a note must not rewrite the note.

The app may update app-managed frontmatter fields only during an explicit user save operation, and only if the user has opted into app-managed metadata behavior or the behavior is part of a clearly documented MVP requirement.
