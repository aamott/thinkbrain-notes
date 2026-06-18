> [!WARNING]
> **AI Synthesized**: This file was synthesized by an AI agent based on conversational context. It was not explicitly written in the final chat summary and requires manual review.

# App Architecture

## High-Level Architecture
The project uses a monorepo approach (Turborepo) to maximize code reuse across platforms.

- **Shared Core (`/packages/*`)**: TypeScript libraries handling file system abstractions, markdown parsing, indexing, search, extensions, and state logic. These packages must never depend on UI implementations.
- **Desktop Client (`/apps/desktop`)**: React for the UI, wrapped in Tauri (Rust) for Windows, Mac, and Linux. This ensures native performance, low RAM usage, direct file-system access, and system Git integration.
- **Mobile Client (`/apps/mobile`)**: React Native (via Expo) for Android and iOS (Phase 2).
- **State Management**: Zustand for lightweight, cross-component state management (e.g., managing open tabs, sidebar state).

## Hub-and-Spoke Strategy
Because Desktop and Mobile handle native APIs differently, the Shared Core defines strict interfaces:
- `IFileSystem`
- `IMarkdownParser`
- `IIndexer`
- `ISearchService`
- `ICommandRegistry`
- `IWorkspaceManager`
- `IExtensionHost`
- `IGitProvider`
- `ISettingsRegistry`

Platform-specific apps implement these interfaces:
- **Desktop (Tauri)**: Implements interfaces using `@tauri-apps/plugin-fs` and `@tauri-apps/plugin-sql` via Rust commands.
- **Mobile (React Native)**: Implements interfaces using `expo-file-system` and `expo-sqlite`.

## Package Dependency Tree
- `shared-types` (No dependencies)
- `ui-contracts` (Depends on: `shared-types`)
- `filesystem` (Depends on: `shared-types`)
- `indexer` (Depends on: `filesystem`, `shared-types`)
- `search` (Depends on: `indexer`, `shared-types`)
- `markdown` (Depends on: `shared-types`)
- `commands` (Depends on: `shared-types`)
- `workspace` (Depends on: `shared-types`)
- `extensions` (Depends on: `commands`, `shared-types`, `ui-contracts`)
- `git` (Depends on: `filesystem`, `shared-types`)
- `settings` (Depends on: `shared-types`)
- `desktop` & `mobile` (May depend on all packages)

## Data Flow
Markdown files are the sole source of truth. The database is an ephemeral cache.

```text
Vault
  ↓
File Watcher
  ↓
Indexer
  ↓
SQLite FTS5
  ↓
Search Services
```
