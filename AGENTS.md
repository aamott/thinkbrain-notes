# ThinkBrain Notes Project Guidance

Open, local-first knowledge workspace inspired by Obsidian & VS Code. Standard Markdown files with zero database lock-in. Fast, extensible, Git-compatible with optional AI integration and Agent Client Protocol (ACP) support.

## File Map
- **`apps/desktop/`** - Desktop Application (React UI & Tauri Rust Host). See [apps/desktop/AGENTS.md](file:///media/adam/extex/projects/thinkbrain-notes/apps/desktop/AGENTS.md).
  - **`apps/desktop/src/`** - Frontend UI & Client State. See [apps/desktop/src/AGENTS.md](file:///media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/AGENTS.md).
  - **`apps/desktop/src-tauri/`** - Tauri Rust Backend & ACP Host. See [apps/desktop/src-tauri/AGENTS.md](file:///media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/AGENTS.md).
- **`packages/core/`** - Core Domain Models & Parsing (Platform-Agnostic TS). See [packages/core/AGENTS.md](file:///media/adam/extex/projects/thinkbrain-notes/packages/core/AGENTS.md).
- **`packages/ui/`** - Design System & Component Library (Tailwind v4 & shadcn). See [packages/ui/AGENTS.md](file:///media/adam/extex/projects/thinkbrain-notes/packages/ui/AGENTS.md).
- **`plans/`** - Architecture epics, feature specs, and task tracking.
- **`scripts/`** - Project scripts (`scripts/qa.sh` for lint/typecheck/tests).
- **`docs/`** - Subagent review logs and known issue trackers.

## Core Architecture
- **Layer Separation**: `packages/core` is strictly platform-agnostic. UI components never call Tauri/Rust directly; all native communication is routed through `apps/desktop/src/native/` adapters.
- **Modularity**: Small, focused files (< 500 lines preferred).
- **Styling**: Tailwind v4 tokens (`--tn-*`) in `packages/ui/src/styles/tokens.css` mapped in `apps/desktop/src/index.css`. Theme switching is handled via `data-thinkbrain-theme` attributes.
- **ACP Integration**: Tauri Rust host owns agent process lifecycle via `agent-client-protocol` crate. Renderer receives Tauri events directly.

## Quality & Conventions
- Run `./scripts/qa.sh` or `pnpm lint` and `pnpm typecheck` before completing tasks.
- Avoid `any` types; prefer strict types or `unknown`.
- Fail loudly: log errors clearly and return typed results.

## Development & Launching
- To run the Tauri desktop app in development mode, use `pnpm desktop:tauri dev` in the project root. Note: `pnpm dev` only launches the web UI, so always use `pnpm desktop:tauri dev` to test native functionality.
