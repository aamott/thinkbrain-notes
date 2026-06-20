# Project Status

> Living status tracker. **Keep this file under 100 lines.** Trim stale detail
> aggressively — this is a snapshot, not a changelog. History lives in git.

_Last updated: 2026-06-19_

## Repository

- Path: `c:\Users\New\Documents\Edwards Files\thinkbrain-notes`
- Stack: pnpm workspaces, Tauri v2, React + TS + Vite, Zustand, Vitest, Playwright.

## Current Focus

- **Work Item 007** — Settings (next up). 006 just landed.
- 006 added native SQLite FTS5 search: per-workspace cache in OS app-data (never the vault), 4 native commands (`index_documents`/`search_index`/`clear_index`/`remove_index_document`), background frontend indexing reusing the core `parseNote`, and a clickable Search panel in the activity bar.

## Work Items

| # | Item | Status |
|---|------|--------|
| 001 | Project scaffold | Done |
| 002 | Desktop Tauri shell | Done |
| 003 | Workspace + file explorer | Done |
| 004 | Note model + Markdown parser | Done |
| 005 | Editor | Done |
| 006 | Indexer + search | Done |
| 007 | Settings | Next |
| 008 | Git integration | Not started |
| 009 | Theme foundation | Not started |
| 010 | Test/CI + quality | Not started |

## Validation Baseline (last full pass)

All green from repo root:
`pnpm install` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` · `pnpm build`
Rust: `cargo test --manifest-path "apps\desktop\src-tauri\Cargo.toml"` (11 passed).
Desktop unit: 21 passed. e2e: 2 passed.

## Environment Notes

- Repo path must avoid apostrophes (breaks Tauri Windows `RC.EXE`).
- Use `pnpm install --quiet` after folder moves.
- Fresh sandbox may need `pnpm exec playwright install chromium`.
- `tauri dev`: Vite must ignore `src-tauri/**` (set in `vite.config.ts`) or its watcher hits EBUSY on Rust build artifacts.

## Open Decisions / Blockers

- No blockers. Non-blocking items in `plans/open-items.md` (OI-001..OI-005).

## Next Up

- Assign `plans/work-items/007-settings.md` (JSON settings; app + workspace levels stored in OS app-data, not the vault).
