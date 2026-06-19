# Technical Decisions

This document is the source of truth for cross-cutting implementation decisions.

## Platform

Decision: Build a cross-platform application, desktop-first.

- Frontend: React, TypeScript, Vite
- Desktop shell/native bridge: Tauri v2
- Backend/native code: Rust
- Mobile (Phase 2): React Native via Expo for Android/iOS

Mobile implementation is deferred to Phase 2, but the shared-core architecture and platform adapter interfaces are designed from day one so that `packages/core` never couples to desktop-only APIs.

## Repository Structure

Decision: Use a workspace-style repository with platform-specific apps and shared packages.

Target structure:

```text
apps/
  desktop/          # Tauri + React (DOM) — MVP
    src/
    src-tauri/
  mobile/           # React Native (Expo) — Phase 2, not scaffolded during MVP
    src/

packages/
  core/             # platform-agnostic logic and adapter interfaces
  ui/               # React (DOM) components — consumed by apps/desktop only
```

`apps/mobile/` is shown here for architectural visibility. It must NOT be scaffolded or implemented during MVP work.

`packages/ui` contains React DOM components and is not directly usable by React Native. The mobile app will have its own UI layer. Shared design tokens (colors, spacing, typography scales) should live in `packages/core` so both platforms can reference them.

Do not split `packages/core` into many packages until the codebase has enough complexity to justify it.

## Package Manager and Build Orchestration

Decision: Use `pnpm` workspaces without Turborepo for MVP.

Reasoning:

- `pnpm` is stable, widely supported, and works well with Tauri/Vite/React tooling.
- Bun is fast, but `pnpm` is the safer default for broad dependency compatibility and future agent reliability.
- Turborepo can be added later if build orchestration becomes painful. Do not add Turborepo during the initial scaffold unless this decision changes.

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

Decision: Use SQLite FTS5 from the start as a disposable cache for indexing and search.

- SQLite must never be the source of truth.
- The index must be rebuildable from workspace files.
- Database files must be stored in the OS application-data directory, not inside the workspace/vault.
- Prefer implementing SQLite/indexing through the Tauri/Rust layer so filesystem access, app-data paths, background work, and database behavior stay native and predictable.

## Search

Decision: MVP search should support Markdown text, filenames, tags, and aliases using SQLite FTS5.

If SQLite integration hits a temporary scaffold blocker, agents may create a narrow interface first, but the intended MVP implementation remains SQLite FTS5 rather than a long-lived in-memory search.

## Git

Decision: Use system Git for MVP.

- Invoke installed Git binaries through the desktop/native layer.
- Do not implement embedded Git for MVP.

## Settings

Decision: Use human-readable JSON settings.

Settings levels:

1. Application settings
2. Workspace settings stored outside the workspace
3. Extension settings, deferred until extension work exists

Workspace settings must live in the OS application-data/config area, keyed by workspace identity/path. Do not place app settings files inside the user's workspace during MVP.

## Extensions

Decision: MVP supports internal contribution points only.

Do not build third-party extension execution, install-from-URL, sandboxing, signing, or marketplace features during MVP.

## UI Components and Themes

Decision: Build `packages/ui` early using reusable React components, CSS variables, and accessibility-focused primitives.

Recommendation:

- Use custom app components backed by Radix UI-style primitives where useful.
- Avoid a heavy, opinionated component framework that fights a desktop/editor UI.
- Theme tokens should be CSS variables.

MVP may include built-in themes and theme tokens. Third-party theme packages are deferred until the extension system exists.

## AI

Decision: AI is deferred beyond MVP.

No AI provider abstraction, model configuration, ACP (Agent Client Protocol) integration, embeddings, or AI UI should be implemented unless explicitly assigned by a future work item.

## Sync

Decision: Built-in cloud sync is deferred.

The project follows Bring Your Own Sync as a future documented strategy. MVP must avoid storing app caches in the workspace so users can safely use external sync tools.

## State Management

Decision: Use Zustand for MVP app/UI state.

Reasoning: Zustand is lightweight, simple, and appropriate for editor tabs, active workspace/document state, sidebar state, indexing status, and settings state.

## Frontmatter Mutation Policy

Decision: Opening, indexing, or searching a note must not rewrite the note.

The app should manage `created_at` and `updated_at` frontmatter fields during explicit note creation/save operations:

- `created_at` is set when the app creates a new note if the field is missing.
- `updated_at` is updated when the user explicitly saves a note through the app.
- Indexing and opening a note must not update timestamps.
- Unknown frontmatter fields must be preserved.
