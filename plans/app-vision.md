# App Vision

> The single source of truth for what this app is, why it exists, and where it's
> going. Read this first before any epic work. Only changes when the user
> explicitly directs.

## What We're Building

An open, privacy-first knowledge workspace inspired by Obsidian and VS Code.

Users own their files. No proprietary note format. Everything is stored as
normal Markdown files. The project scales from a lightweight note editor into a
complete knowledge platform.

## Core Principles

**Markdown First** — Markdown files are the source of truth. No database lock-in.

**Local First** — Everything works offline. Internet features are optional.

**Fast** — Instant startup. Minimal memory usage. Lazy loading.

**Simple** — Avoid unnecessary abstractions. Prefer understandable code over
clever code.

**Extensible** — Everything should be replaceable through the extension API.

**Privacy** — User owns their data. No telemetry by default. No vendor lock-in.

**Git Friendly** — Projects are normal folders. Files are normal Markdown.
Compatible with Git, GitHub, GitLab, etc.

**AI Native** — AI should enhance workflows. AI is optional. Local models are
fully supported. Cloud providers are optional.

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + Vite |
| State | Zustand |
| Desktop shell | Tauri v2 (Rust) |
| Mobile (Phase 2) | React Native (Expo) |
| Editor | CodeMirror 6 |
| Native backend | Rust |
| Storage | Markdown files + JSON config |
| Search index | SQLite FTS5 (ephemeral cache, never source of truth) |
| Git | System Git (invoked via Rust) |
| AI | Local and remote providers (deferred) |
| Extensions | Internal API (V1); capability-based sandbox |

## Architecture

```text
apps/
  desktop/          # Tauri + React (DOM) — MVP
    src/            # React UI and desktop frontend state
    src-tauri/      # Rust/Tauri native bridge
  mobile/           # React Native (Expo) — Phase 2
    src/            # mobile-specific screens and adapters

packages/
  core/             # platform-agnostic logic (no React, no DOM, no Node)
  ui/               # reusable React (DOM) components and design tokens
```

**Hub and spoke**: `packages/core` holds all business logic and must never
depend on UI. `apps/desktop` and `apps/mobile` implement platform adapters
against interfaces defined in `packages/core`.

**Data flow**: Markdown files → parser → indexer → disposable SQLite cache →
search UI / backlinks / future graph. The index is always rebuildable from disk.

**User data separation**: App data (settings, index, cache) never goes in the
vault. Vault = Markdown files + attachments only. App data lives in OS
`AppData`/config directories.

**Bring your own sync**: No cloud sync. Users rely on OneDrive/Syncthing/Git.
No proprietary cloud backend assumptions.

## MVP Scope

Build a fast, local-first desktop Markdown workspace where a user can open a
folder, browse notes, edit Markdown files, search notes, configure basic
settings, and perform basic Git operations.

**In scope:**
- Desktop app (Tauri + React + TS + Vite)
- Workspace folder opening
- File explorer (Markdown + read-only non-Markdown)
- Note CRUD (create, rename, delete, read, write)
- CodeMirror 6 Markdown editor
- YAML frontmatter parsing (tags, aliases, wiki-links)
- Basic full-text search (SQLite FTS5)
- JSON application settings (stored in OS app-data)
- Basic Git integration (system Git: status, stage, commit, branch, init)
- Built-in theme foundation (CSS variables, light/dark)
- Test/lint/typecheck/build workflow

**Out of scope:**
- Mobile app · Cloud sync · Conflict-resolution UI · AI assistant · AI provider
  abstraction · Embeddings · Semantic search · Extension marketplace ·
  Third-party extension execution · Public plugin API · Graph view · Canvas ·
  Collaboration · Publishing · Auto-updater · Custom sync service · Embedded Git

**Quality bar:**
- User files remain normal Markdown files.
- The app must work offline.
- The editor opens quickly even if indexing is still running.
- Search/index data is rebuildable from disk.
- App caches are not stored inside the workspace.
- Errors fail loudly with useful messages.
- Core functionality is covered by tests where practical.

## Epic Stream

The project is organized as a flat stream of epics — no phase buckets.
Each epic is a feature area at `plans/<status>-<epic>-<urgency>-<difficulty>.md`
with a Status section. Stories live in `plans/<epic-name>/` with
status/urgency/difficulty encoded in filenames. When all epic items are ✅, the
epic is deleted.

**MVP-remaining (high/med urgency):**
- [`git-integration`](wip-git-integration-high-hard.md) — system Git integration (next up)
- [`theme-foundation`](wip-theme-foundation-high-hard.md) — CSS variable tokens, light/dark themes, UI primitives
- [`test-ci-quality`](wip-test-ci-quality-high-med.md) — validation scripts, Vitest, Playwright, CI

**MVP follow-ups (med/low urgency):**
- [`workspace-explorer`](wip-workspace-explorer-med-med.md) — non-Markdown file ops, drag-and-drop, hidden files
- [`indexing-search`](wip-indexing-search-med-med.md) — file watcher, connection pooling
- [`note-model`](wip-note-model-low-hard.md) — frontmatter formatting preservation
- [`ui-shell`](wip-ui-shell-med-hard.md) — movable actions, layout slots, command palette

**Future epics (low urgency, stub with prerequisites noted):**
- [`extensions`](pending-extensions-low-hard.md) — extension API + capability sandbox (prerequisite for AI, marketplace)
- [`ai`](wip-ai-low-hard.md) — local/remote provider abstraction, ACP integration (depends on `extensions`)
- [`semantic-search`](pending-semantic-search-low-hard.md) — embeddings-based search (depends on `indexing-search`, possibly `ai`)
- [`graph`](pending-graph-low-hard.md) — backlinks and graph view (depends on `indexing-search`, `note-model`)
- [`canvas`](pending-canvas-low-hard.md) — infinite canvas editor
- [`mobile`](pending-mobile-low-hard.md) — React Native/Expo app (depends on core adapter interfaces)
- [`marketplace`](pending-marketplace-low-med.md) — extension discovery, signing, update flow (depends on `extensions`; install mechanism owned by `extensions`)
- [`collaboration`](wip-collaboration-low-hard.md) — real-time collaboration (bottom priority, exploratory; local-first, opt-in, P2P preferred — only if we can make it work within the core principles)

**Not an epic:** Sync — "bring your own sync" is a design principle, not a
feature. Sync conflict assistance may become a maintenance story later.

## Reference Documents

- `plans/technical-decisions.md` — cross-cutting technical decisions
- `plans/testing-strategy.md` — testing approach and validation commands
- `.agents/AGENTS.md` — architecture rules, planning system, styling, linting
