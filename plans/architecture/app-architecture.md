# App Architecture

## Goal

Build a cross-platform local Markdown workspace with a clean separation between platform-specific UI, shared application logic, and native capabilities. Desktop (Tauri) ships first; mobile (React Native / Expo) follows in Phase 2.

## High-Level Shape

```text
apps/
  desktop/
    src/          # React (DOM) UI and desktop frontend state
    src-tauri/    # Rust/Tauri native bridge
  mobile/         # React Native (Expo) — Phase 2, not scaffolded during MVP
    src/          # mobile-specific screens, navigation, and native adapters

packages/
  core/           # platform-agnostic application logic (no React, no DOM, no Node)
  ui/             # reusable React (DOM) components, primitives, and design tokens
```

> **Note:** `packages/ui` contains React DOM components and is consumed by `apps/desktop`. The mobile app will have its own React Native UI layer in `apps/mobile/src/`. Shared design tokens (colors, spacing, typography scales) live in `packages/core` or a future `packages/tokens` package so both platforms can reference them.

## Runtime Responsibilities

## React Frontend

Responsible for:

- application layout
- editor UI
- file explorer UI
- search UI
- settings UI
- Git/source-control UI
- transient UI state using Zustand

The React frontend should not directly depend on native APIs. It should call typed adapters/services.

## `packages/core`

Responsible for platform-agnostic logic:

- note metadata types
- Markdown/frontmatter parsing
- workspace domain types
- settings schemas
- search/index domain types
- Git domain types
- command and contribution-point types
- **platform adapter interfaces** (see below)

`packages/core` must not import React, Tauri, DOM-specific APIs, or Node-only APIs unless a submodule is explicitly marked as environment-specific.

## Platform Adapter Contract

`packages/core` defines TypeScript interfaces for native capabilities. Each platform app provides its own implementation:

```text
packages/core/src/adapters/
  FileSystemAdapter.ts      # read, write, list, watch files
  SearchAdapter.ts          # index and query notes
  AppPathsAdapter.ts        # OS-specific app-data / cache paths
  GitAdapter.ts             # status, stage, commit, branch
  SettingsAdapter.ts        # load / save JSON settings
```

| Adapter | Desktop (Tauri) | Mobile (React Native) |
|---|---|---|
| FileSystem | Tauri fs commands + Rust backend | Expo FileSystem / SAF |
| Search | SQLite FTS5 via Rust | SQLite via expo-sqlite or equivalent |
| AppPaths | Tauri path API | Expo FileSystem.documentDirectory |
| Git | System Git via Rust shell | Likely isomorphic-git or deferred |
| Settings | Tauri fs + OS app-data paths | AsyncStorage or Expo SecureStore |

Adapters are injected at app startup. Shared logic in `packages/core` calls only the interface — never a platform API directly.

## Tauri/Rust Layer

Responsible for native capabilities:

- opening workspace folders
- reading/writing files
- file watching
- system Git commands
- SQLite FTS5 search/index storage
- OS app-data paths

The Tauri layer should fail loudly with useful typed errors rather than hiding native failures.

## Data Flow

Markdown files are the source of truth. Indexes are derived data.

```text
Workspace folder
  -> File service
  -> Markdown/frontmatter parser
  -> Indexer
  -> Disposable search cache
  -> Search UI / backlinks / future graph
```

## Startup Behavior

The app should open quickly. Expensive indexing work must happen asynchronously after the user can interact with the workspace and editor.

## Agent Boundary Guidance

Sub-agents should prefer editing one of these areas at a time:

- scaffold/build system
- desktop shell/native commands
- workspace/file system
- notes/Markdown parsing
- editor
- indexing/search
- settings
- Git
- UI shell
- tests/CI
