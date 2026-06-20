# Project Status

> Living status tracker. **Keep this file under 100 lines.** Trim stale detail
> aggressively — this is a snapshot, not a changelog. History lives in git.

_Last updated: 2026-06-20_

## Repository

- Path: `c:\Users\New\Documents\Edwards Files\thinkbrain-notes`
- Stack: pnpm workspaces, Tauri v2, React + TS + Vite, Zustand, Vitest, Playwright.

## Current Focus

- **Work Item 008** — Git integration (next up). 007 (Settings) done.
- UI: explorer is a `react-arborist` file tree that lists the **full vault** — real folders (incl. empty), Markdown, and non-Markdown files (read-only). Native `list_workspace_entries` walks the tree (skips dot-prefixed entries); Markdown stays editable with new/rename/delete.
- 007 added versioned JSON app settings in core, native raw settings IO in OS app-data (never the vault), and a basic Settings panel with persisted theme/editor preferences.

## Work Items

| # | Item | Status |
|---|------|--------|
| 001 | Project scaffold | Done |
| 002 | Desktop Tauri shell | Done |
| 003 | Workspace + file explorer | Done |
| 004 | Note model + Markdown parser | Done |
| 005 | Editor | Done |
| 006 | Indexer + search | Done |
| 007 | Settings | Done |
| 008 | Git integration | Next |
| 009 | Theme foundation | Not started |
| 010 | Test/CI + quality | Not started |

## Validation Baseline (last full pass)

Latest (file-tree → full file manager) from repo root:
`pnpm typecheck` · `pnpm lint` · `pnpm test` (core 14, ui 1, desktop 34 passed) · `cargo test --manifest-path "apps\desktop\src-tauri\Cargo.toml"` (15 passed) · `pnpm build`. `tauri dev` smoke-launched clean. (e2e not re-run this pass.)

## Environment Notes

- Repo path must avoid apostrophes (breaks Tauri Windows `RC.EXE`).
- Use `pnpm install --quiet` after folder moves.
- Fresh sandbox may need `pnpm exec playwright install chromium`.
- `tauri dev`: Vite must ignore `src-tauri/**` (set in `vite.config.ts`) or its watcher hits EBUSY on Rust build artifacts.

## Open Decisions / Blockers

- No blockers. Non-blocking items in `plans/open-items.md` (OI-001..OI-006; non-MD files are read-only, no cross-folder drag yet).

## Next Up

- Assign `plans/work-items/008-git-integration.md`.
