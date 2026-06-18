> [!WARNING]
> **AI Synthesized**: This file was synthesized by an AI agent based on conversational context. It was not explicitly written in the final chat summary and requires manual review.

# Mobile Strategy

## Phased Approach
- **Phase 1**: Desktop Only (Windows, Mac, Linux via Tauri).
- **Phase 2**: Mobile Client (iOS, Android via React Native / Expo).

## Architecture
- The mobile application will NOT be an Electron wrapper or a webview. It will be built natively using React Native.
- It will consume the exact same `packages/` (Shared Core) as the desktop app (e.g., `markdown`, `search`, `workspace`).
- Because Mobile and Desktop handle the filesystem and SQLite differently, the mobile app will implement the platform-specific adapters (e.g., `expo-file-system` and `expo-sqlite`) to fulfill the `IFileSystem` and `IIndexer` interfaces.
- The UI state management (`shared-types`) relies on abstract concepts so that the Mobile UI can implement native navigation paradigms (like bottom tab bars) rather than trying to force desktop split-panels onto a phone screen.
