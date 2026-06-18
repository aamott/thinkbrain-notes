> [!WARNING]
> **AI Synthesized**: This file was synthesized by an AI agent based on conversational context. It was not explicitly written in the final chat summary and requires manual review.

# Backend Implementation

## Tech Stack
- Rust
- Tauri for desktop application shell

## Architecture
- The backend serves as a thin bridge to native system APIs (file system, system Git, SQLite).
- Implements the platform-specific side of the core interfaces (`IFileSystem`, `IIndexer`, `ISearchService`).
- Tauri Commands are exposed to the frontend, but the frontend interacts with them through the shared adapter packages.

## Performance
- Heavy operations (like full vault indexing) are offloaded to Rust background threads to avoid blocking the React UI.
- File system watchers are run natively in Rust to reduce bridging overhead.
