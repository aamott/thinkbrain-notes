# ThinkBrain Notes Project Guidance

Open, local-first knowledge workspace inspired by Obsidian & VS Code. Standard Markdown files with zero database lock-in. Fast, extensible, including extensions. Supports Mac, Windows, Linux, ios, and Android. Stores metadata separate from the repo to avoid syncing issues with OneDrive and SyncThing. 

Future extensions include: 
- ACP Agent Chat
- Auto Sync: git push/pull via bundled gix, plus rescue of cloud-daemon conflict files
- Automatic conflict resolution for
  - OneDrive
  - SyncThing
  - Other

## File Map

Keep map up to date with frequently accessed files. Relative filepaths. Concise.

```
apps/desktop/  # React UI + Tauri Rust host (See apps/desktop/AGENTS.md)
├─ src/  # Frontend UI & client state (See apps/desktop/src/AGENTS.md)
│  ├─ agent/  # Assistant panel (ACP renderer boundary)
│  ├─ commands/  # Command palette & registry
│  ├─ events/  # App-wide event bus
│  ├─ extensions/  # Extension host, bootstrap, builtins, loader
│  ├─ lib/  # Shared renderer utils
│  ├─ native/  # Tauri bridge: commands, dialogs, fs, assets
│  ├─ panels/  # Left/right popouts, bottom panel, outline
│  ├─ search/  # Search panel & model
│  ├─ settings/  # Settings UI, theme provider, desktop state
│  ├─ shell/  # DesktopShell, activity bar, title bar, status bar; StatusBar.tsx owns sync-error toast, setup-success toast + notification bell
│  ├─ tabs/  # Tab model, registry, editor, live preview
│  └─ workspace/  # Explorer, document adapter, workspace model
├─ src-tauri/  # Rust backend & ACP host (See apps/desktop/src-tauri/AGENTS.md)
│  └─ src/commands/  # Tauri commands: extensions, markdown, search, settings, sync (history, maintain, sign-in, import), themes, watcher, workspace
│     └─ search/  # Structured metadata facet storage, queries, and focused tests
├─ e2e/  # Playwright E2E specs
└─ demo/  # Demo fixtures
packages/core/  # Platform-agnostic TS: note model, markdown, frontmatter, settings, layout, extensions (See packages/core/AGENTS.md)
packages/ui/  # Design system: tokens, shadcn components (See packages/ui/AGENTS.md)
plans/  # Epics, feature specs, task tracking (See ## Plans below)
scripts/  # qa.sh, rust-env.sh, with-rust-env.sh
docs/  # Reviews, known issues, superpowers specs
examples/extensions/  # Sample extension (hello-notes)
```

## Core Architecture
- **Layer Separation**: `packages/core` is strictly platform-agnostic. UI components never call Tauri/Rust directly; all native communication is routed through `apps/desktop/src/native/` adapters.
- **Modularity**: Small, focused files (< 500 lines preferred).
- **Styling**: Tailwind v4 tokens (`--tn-*`) in `packages/ui/src/styles/tokens.css` mapped in `apps/desktop/src/index.css`. Theme switching is handled via `data-thinkbrain-theme` attributes.
- **ACP Integration**: Tauri Rust host owns agent process lifecycle via `agent-client-protocol` crate. Renderer receives Tauri events directly.

## Quality & Conventions
- Run `./scripts/qa.sh` before completing tasks. Runs all linting, formatting, and tests.
- Avoid `any` types; prefer strict types or `unknown`.
- Fail loudly: log errors clearly and return typed results.

## Development & Launching
- To run the Tauri desktop app in development mode, use `pnpm desktop:tauri dev` in the project root. Note: `pnpm dev` only launches the web UI, so always use `pnpm desktop:tauri dev` to test native functionality.


## Plans
List relevant folder to see task status. Status lives in the filename — `pending`, `wip`, or `done` — and the filename, the file's own `## Status` section, and reality must all agree. When you finish work, change all three in the same commit. An epic's `## Status` must not contradict its own stories: if a story shipped, say so in the epic too, and never leave an epic naming a prerequisite as blocked when the story that provides it is `done`. When a story file is consolidated into a `done-summary.md` or deleted, grep `plans/` for its filename and fix every reference — a plan pointing at a file that no longer exists reads as unfinished work and will send the next session at it. Review after milestones. Delete tasks after review, or fix status if work is not complete. Add action items from review as stories unless they are immediately fixable. Plans should be concise. Avoid duplicating info in files and long worklogs. Compare file layouts and architectures before starting work.

**Plan Folder**

Filename grammar: `[NN-]status-name[-urgency]-difficulty.md`
(`NN` = optional 2-digit order; urgency optional, defaults to med)
```
./plans/
├── status-epic_name-urgency-difficulty.md
├── epic_name/
│   └── [NN-]status-story_name-urgency-difficulty.md
└── other_tasks/ # bugs, chores, etc.
    └── status-task_name-urgency-difficulty.md
```

## Reviews
Review findings are stored in `docs/reviews/` with filename format `YYYY-MM-DD/finding_name-urgency-difficulty.md`. Check validity before implementing and avoid duplication. Findings are deleted upon being addressed.

## Repomix

For major or cross-cutting refactors, `npx repomix --compress` can help map dependencies before editing. Use `--include` for a focused area; treat `repomix-output.xml` as generated and regenerate it when useful.

## Build Tooling (Linux, optional)
- Rust builds auto-enable `sccache`/`mold`/`clang` if installed (no setup). Suggested: `sudo apt install sccache mold clang`. Details in `scripts/rust-env.sh`.
- Build profiles live in `apps/desktop/src-tauri/Cargo.toml`: `[profile.dev]` favors compile speed, `[profile.release]` favors runtime speed + small binaries.


## Rules/suggestions
- Never commit/push without explicit user approval. Recommend commit message and what to try out. No signatures in commit messages.
- Never change AGENTS.md (this file) without explicit user direction and approval. (Exception: `## File Map`)
- Write compact, maintainable, optimized code. Shorter code is easier to read.
- Avoid large files. Never over 800 lines. Break up earlier rather than later when it's already big. 

## Unique Terminology
- Action bar: Left screen, contains buttons for different features.
  - Contains: Explorer, search, tags, extensions `side: "left"` (journal, etc), and an extensions menu. Settings at bottom.
- Action items menu: Top right menu, contains buttons for different features.
  - Contains: Outline, properties, backlinks, and extensions `side: "right"` (agent chat, etc).