# App Vision

> The single source of truth for what this app is, why it exists, and where it's
> going. Read this first before any epic work. Only changes when the user
> explicitly directs.

## What We're Building

An open, privacy-first knowledge workspace inspired by Obsidian and VS Code.

Users own their files. Notes use normal Markdown with no proprietary note format;
user-owned `.canvas` JSON is the explicit whiteboard-document exception. The project
scales from a lightweight note editor into a complete knowledge platform.

## Core Principles

**Markdown First** — Markdown files are the source of truth. No database lock-in.

**Local First** — Everything works offline. Internet features are optional.

**Fast** — Instant startup. Minimal memory usage. Lazy loading.

**Simple** — Avoid unnecessary abstractions. Prefer understandable code over
clever code.

**Extensible** — Everything should be replaceable through the extension API.

**Privacy** — User owns their data. No telemetry by default. No vendor lock-in.

**Git Friendly** — Projects are normal folders. Notes are Markdown; user-owned
`.canvas` documents are plain JSON. Both are compatible with Git and external sync.

**AI Native** — AI should enhance workflows. AI is optional. Local models are
fully supported. Cloud providers are optional.

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + Vite |
| State | Zustand |
| Desktop shell | Tauri v2 (Rust) |
| Mobile (Phase 2) | Tauri Mobile (same webview as desktop) |
| Editor | CodeMirror 6 |
| Native backend | Rust |
| Storage | Markdown files + JSON config; secrets via native OS store |
| Search index | SQLite FTS5 (ephemeral cache, never source of truth) |
| Sync | Bundled gix (no system Git; must compile for desktop and mobile) |
| AI | Extension-based; local and remote providers (deferred) |
| Extensions | Trusted local same-context modules (beta); soft capability gates |

## Architecture

```text
apps/
  desktop/          # Tauri + React (DOM) — MVP
    src/            # React UI and frontend state (shared with mobile)
    src-tauri/      # Rust/Tauri native bridge (desktop + mobile targets)

packages/
  core/             # platform-agnostic logic (no React, no DOM, no Node)
  ui/               # reusable React (DOM) components and design tokens
                    # (shared by desktop and mobile — same webview)
```

**Hub and spoke**: `packages/core` holds all business logic and must never
depend on UI. `apps/desktop` implements platform adapters against interfaces
defined in `packages/core`. Mobile is a responsive variant of the desktop app,
not a separate app — it is a Tauri Mobile build target of `apps/desktop/` using
the same webview, the same React frontend, the same `packages/ui`, and the same
Tauri adapters. There is no `apps/mobile/` directory.

**Data flow**: Markdown files → parser → indexer → disposable SQLite cache →
search UI / backlinks / future graph. The index is always rebuildable from disk.

**User data separation**: App data (settings, index, cache) never goes in the
vault. Vault = Markdown files + attachments, plus user-owned `.canvas` JSON
documents as an explicit vault-file exception. Canvas settings, cache, and
viewport/session state live in OS `AppData`/config directories.

**Bring your own sync**: No proprietary cloud backend, ever. Whatever the user
already runs — OneDrive, Google Drive, Syncthing — moves the files; the app's
job is to notice the conflict copies those daemons leave behind and help
resolve them. Git is the one transport the app drives itself, through a
bundled gix rather than a `git` binary the user may not have. Both are one
feature (`plans/pending-auto_sync-med-hard.md`), not two.

## MVP Scope

Build a fast, local-first desktop Markdown workspace where a user can open a
folder, browse notes, edit Markdown files, search notes, and configure basic
settings.

**In scope:**
- Desktop app (Tauri + React + TS + Vite)
- Workspace folder opening
- File explorer (Markdown + read-only non-Markdown)
- Note CRUD (create, rename, delete, read, write)
- CodeMirror 6 Markdown editor
- YAML frontmatter parsing (tags, aliases, wiki-links)
- Basic full-text search (SQLite FTS5)
- JSON application settings (stored in OS app-data)
- Built-in theme foundation (CSS variables, light/dark)
- Test/lint/typecheck/build workflow

**Quality bar:**
- User note files remain normal Markdown files; user-owned `.canvas` documents
  are the explicit plain-JSON vault exception.
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

## Reference Documents

- `AGENTS.md` — architecture rules, planning system, styling, linting. Each
  package carries its own alongside it (`apps/desktop/`, `packages/core/`, …).
- Cross-cutting decisions live in the epic that owns them, not a central
  register — a single decisions file drifted out of date and was removed.
