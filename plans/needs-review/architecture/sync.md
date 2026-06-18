> [!WARNING]
> **AI Synthesized**: This file was synthesized by an AI agent based on conversational context. It was not explicitly written in the final chat summary and requires manual review.

# Sync Strategy

## Philosophy
Bring Your Own Sync (BYOS).

The vault directory is a standard folder on the local file system.
Users can place their vault inside any sync provider's directory (OneDrive, Dropbox, Syncthing, iCloud, Google Drive).

The application does NOT contain built-in cloud syncing for notes.

## Conflict Resolution
Since the application relies on external sync providers, conflicts will happen.

- Providers typically create duplicate files with modified names (e.g., `Note-DESKTOP-XYZ.md`).
- A `File Watcher` observes the vault directory.
- It detects conflicts via Regex on file names.
- When a conflict is detected, the UI displays a notification.
- A Diff/Merge modal is presented to the user (powered by a `diff-match-patch` library).
- The user resolves the conflict visually and saves the merged result.

## Application Data
Application data (settings, search index, cache) must NEVER be stored in the vault to avoid sync corruption or noise.
- Windows: `AppData/Roaming/AppName`
- Mac: `~/Library/Application Support/AppName`
- Linux: `~/.config/AppName`
