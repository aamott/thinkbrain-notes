# Project Overview: Note App Workspace

Adhere to these rules at all times.

## Architecture & Non-Negotiable Rules
- **Stack**: React + TypeScript + Vite, Zustand state. Tauri (Rust) desktop shell. React Native (Expo) mobile (Phase 2). CodeMirror 6 editor with Obsidian-like live markdown rendering.
- **Data model**: Pure Markdown. Tasks are Markdown checkboxes (`- [ ]`) only — no proprietary task databases.
- **Database**: SQLite + FTS5 as an *ephemeral indexer cache* only. Never the source of truth. Stored in OS `AppData`, never in the vault.
- **User data separation**: App data (settings, index, cache) never goes in the vault. Vault = Markdown files + attachments only.
- **Bring your own sync**: No cloud sync. Users rely on OneDrive/Syncthing/Git. No proprietary cloud backend assumptions.
- **Hub and spoke**: `packages/` holds all business logic and must never depend on UI. `apps/desktop` and `apps/mobile` implement adapters.
- **Extension permissions**: V1 uses a strict capability-based sandbox (Install from URL/File). No unrestricted filesystem access.
- **Privacy**: No telemetry, no vendor lock-in. The user owns their data.
- Read `plans/app-vision.md` and relevant epics before any major work. Note inconsistencies in the epic's Status section and to the user.

## Planning System

All plans live in `plans/`. The folder structure encodes progress — listing it shows where the project stands.

### Files & Folders
- **`plans/app-vision.md`** — Unifies the app vision across all devs. Read this first for context. Only changes when the user explicitly directs.
- **`plans/<epic-name>.md`** — One file per epic at the `plans/` root. High-level and overarching: goals, scope, architecture decisions. Not implementation detail.
- **`plans/<epic-name>/`** — Story folder for that epic. Contains individual story files.
- **`plans/maintenance/`** — Standalone stories that don't belong to an epic: bugs, fixes, refactors, small tweaks, UI adjustments. Same naming convention as epic stories. Short-lived — knock them out one at a time.

### Epics
- Named with kebab-case, no numbering: `markdown-editor.md`, `vault-indexing.md`.
- Each epic ends with a **Status** section tracking specific features to implement:
  - Each item: `[indicator] brief description — file refs if available`
  - Indicators: `✅ done` · `🔄 wip` · `⬜ pending` · `❌ blocked`
  - Keep each item brief.
- Update the Status section as features are completed or blocked.
- When all Status items are `✅`, delete the epic file and its story folder. Plans show what needs doing, not what was done — read the code for that.

### Stories
- Story files live in `plans/<epic-name>/` or `plans/maintenance/` and are named: `<status>-<description>-<urgency>-<difficulty>.md`
  - **Status**: `done` · `wip` · `pending` · `blocked`
  - **Urgency**: `high` · `med` · `low`
  - **Difficulty**: `easy` · `med` · `hard`
  - **Description**: use underscores, not hyphens, to avoid ambiguity with field separators. E.g. `markdown_parser` not `markdown-parser`.
  - Example: `pending-markdown_parser-high-med.md`
- Listing a story folder shows progress at a glance — status, urgency, and difficulty are encoded in filenames.
- Old stories are deleted over time once complete and no longer needed.
- Each story file should contain: a brief goal, acceptance criteria, and relevant file references. Keep it short.

### Workflow
1. Read `plans/app-vision.md` for app context.
2. Read the relevant epic file(s) for scope and current status.
3. Check the epic's story folder (or `plans/maintenance/`) for `pending` and `wip` stories.
4. When starting a story, rename its file to `wip-…`. When complete, rename to `done-…`. If blocked, rename to `blocked-…` and note the blocker in the file.
5. Update the epic's Status section when features are completed or blocked.
6. Delete old completed stories when no longer needed.
7. When all epic Status items are `✅`, delete the epic file and its story folder.

## Subagent Strategy
Delegate substantial work to subagents to preserve main-chat context. Pick model by task:
- **Composer 2.5**: basic tasks only (small edits, mechanical refactors, lookups, formatting).
- **GPT 5.5 / Opus**: default for planning and implementation.
- **Fable 5**: deepest reviews/planning only (high cost).

## Styling
- No inline styles (`style={{}}` or `<style>` in JSX). Use CSS Modules (`*.module.css`) co-located with components. Shared tokens/themes as CSS variables in `packages/ui`. React Native (Phase 2): use `StyleSheet`.

## Linting
- Run `pnpm lint` after non-trivial edits, before commits, when switching files. Don't batch.
- No `any` without inline eslint-disable + reason; prefer `unknown`/generics.
- Remove unused imports/vars; don't `_`-prefix to silence.
- Lint issues in untouched code → log in the relevant epic's Status section, don't fix in unrelated diffs.
- `eslint.config.js` changes are architectural — flag to user first.