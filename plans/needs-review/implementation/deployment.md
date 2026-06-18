> [!WARNING]
> **AI Synthesized**: This file was synthesized by an AI agent based on conversational context. It was not explicitly written in the final chat summary and requires manual review.

# Deployment Strategy

## Build Process
- Use Turborepo to orchestrate builds across the workspace.
- `pnpm build` will build the shared packages, then the frontend UI, then the Tauri backend.

## Desktop Releases
- Tauri handles packaging and bundling for each OS (Windows `.msi` / `.nsis`, macOS `.dmg` / `.app`, Linux `.deb` / `.AppImage`).
- GitHub Actions handles CI/CD for cross-compiling release artifacts across Windows, Mac, and Ubuntu runners.

## Auto-Updater
- Implement Tauri's built-in updater system so the app automatically checks for new releases on startup.
- Releases will be served directly from GitHub Releases.
