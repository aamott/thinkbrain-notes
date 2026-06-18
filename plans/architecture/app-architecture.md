# App Architecture

## Goal

Build a desktop-first local Markdown workspace with a clean separation between UI, shared application logic, and native desktop capabilities.

## High-Level Shape

```text
apps/
  desktop/
    src/          # React UI and desktop frontend state
    src-tauri/    # Rust/Tauri native bridge

packages/
  core/           # platform-agnostic application logic
  ui/             # reusable UI components and design tokens
```

## Runtime Responsibilities

## React Frontend

Responsible for:

- application layout
- editor UI
- file explorer UI
- search UI
- settings UI
- Git/source-control UI
- transient UI state

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

`packages/core` must not import React, Tauri, DOM-specific APIs, or Node-only APIs unless a submodule is explicitly marked as environment-specific.

## Tauri/Rust Layer

Responsible for native capabilities:

- opening workspace folders
- reading/writing files
- file watching
- system Git commands
- SQLite storage if implemented natively
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
