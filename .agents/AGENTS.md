# Project Guidance
Open, local-first knowledge workspace (Obsidian/VS Code inspired). Standard Markdown files, no db lock-in. Fast, extensible, Git-compatible. AI/cloud-sync are optional. 

**Features:** Wiki-links, tags, extensions (capability-based sandbox), agent chat via Agent Client Protocol (ACP). Future: auto cloud-sync merges. Metadata stored outside vault.

## Architecture
- **Stack**: React, TS, Vite, Zustand, Tauri/Rust, Expo (Phase 2), CodeMirror 6.
- **Core**: `packages/core` is platform-agnostic (no React/DOM/Node/Tauri). Adapters implement interfaces.
- **Native Bridge**: UI components must not call Rust directly; use desktop adapters.
- **Modularity**: Files < 500 lines (max 1000). Prefer small, focused modules.

## File Map
**`apps/desktop/`** - React/Tauri App *(See `apps/desktop/src/AGENTS.md` and `apps/desktop/src-tauri/AGENTS.md`)*
- `src/agent/`: AI logic & Assistant UI
- `src/commands/`: Command palette
- `src/git/`: Source control
- `src/native/`: Tauri bridge adapters (isolate Rust calls here)
- `src/shell/`: Layout, sidebars, panels
- `src/tabs/`: Editor & tab management
- `src/workspace/`: File explorer
- `src-tauri/src/`: Rust backend (FS, Git, ACP host)
- `src-tauri/capabilities/`: Tauri permissions

**`packages/`** - Shared Libraries *(See `packages/core/AGENTS.md` and `packages/ui/AGENTS.md`)*
- `core/src/`: Platform-agnostic models & parsing
- `ui/src/components/`: Reusable components (shadcn)
- `ui/src/styles/`: Tailwind v4 tokens/theme

**Project Root**
- `plans/`: Categorized tasks/epics
- `docs/reviews/`: Subagent code review outputs
- `scripts/qa.sh`: Unified lint/test runner

## UI & Styling
- **Tailwind v4**: Tokens (`--tn-*`) in `packages/ui/src/styles/tokens.css`, mapped via `@theme inline` in `apps/desktop/src/index.css`. Use `cn()`.
- **CSS Modules**: Legacy, being replaced. Do not mix with Tailwind.
- **Theming**: Use `data-thinkbrain-theme` attribute & CSS vars. No JS branching.
- **UX**: Semantic HTML, keyboard support, visible focus. Settings open as a tab (no modals).

## AI & ACP
- **UI**: `@assistant-ui/react` (`useExternalStoreRuntime`). Consumes Tauri events directly.
- **ACP (Host-to-Agent)**: Rust owns lifecycle (`agent-client-protocol` crate) and emits Tauri events. Renderer never imports `@agentclientprotocol/sdk`. Host is deterministic, handles permissions.
- **Sessions**: Explicit, persisted IDs. Never store in vault. No Assistant Cloud by default.

## Quality
- **Scripts**: Run `scripts/qa.sh`, `pnpm lint`, `pnpm typecheck`, tests. Report unrelated bugs.
- **Types**: Avoid `any`; use `unknown` or generics.
- **Architecture**: `eslint.config.*` changes and new native capabilities require documentation/review.

## UI Terminology
- **Action bar**: Far-left strip toggling panels.
- **Left popout**: Sidebar next to action bar (Explorer/Search).
- **Right popout**: Right sidebar (outline/chat).
- **Main canvas/Editor region**: Central area hosting tabs.
- **Tab strip**: Horizontal bar listing open tabs.
- **Command palette**: Cmd/Ctrl+P menu.
- **Status bar/Bottom panel**: Bottom strip (Git, tasks, terminal).
- **Workspace switcher**: Vault switcher.
- **Action items menu**: Top-left menu (global actions).