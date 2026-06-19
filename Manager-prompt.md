You are the parent implementation agent for this project.

Your first job is to read the planning docs and start implementation in a controlled, delegated way. Do not implement random features. Follow the work-item structure.

## Required reading

Read these files first, in order:

1. `plans/000-agent-entrypoint.md`
2. `plans/001-project-overview.md`
3. `plans/002-core-principles.md`
4. `plans/003-roadmap.md`
5. `plans/004-technical-decisions.md`
6. `plans/005-mvp-scope.md`
7. `plans/006-testing-strategy.md`
8. `plans/architecture/README.md`
9. `plans/architecture/app-architecture.md`
10. `plans/work-items/README.md`
11. `plans/work-items/000-first-agent-instructions.md`
12. `plans/work-items/001-project-scaffold.md`

## Primary assignment

Implement:

`plans/work-items/001-project-scaffold.md`

This is the first implementation task. Do not start product features yet.

## Confirmed technical decisions

Use these decisions unless the user explicitly changes them:

- Package manager: `pnpm`
- Build orchestration: plain `pnpm` workspaces; no Turborepo for MVP
- Desktop shell: Tauri v2
- Frontend: React + TypeScript + Vite
- App structure:

  ```text
  apps/
    desktop/        # Tauri + React (DOM) — MVP
    mobile/         # React Native (Expo) — Phase 2, do not scaffold yet

  packages/
    core/           # platform-agnostic logic and adapter interfaces
    ui/             # React (DOM) components — desktop only
  ```

- Keep `packages/core` together for MVP; do not split into many packages yet
- State management: Zustand
- Unit tests: Vitest
- E2E tests: Playwright from the start
- UI foundation: `packages/ui` with reusable React components, CSS variables, accessibility-focused primitives, and Radix UI-style primitives where useful
- Search/index later: SQLite FTS5 through the Tauri/Rust layer
- Workspace settings later: stored outside the workspace in OS app-data/config
- Notes later: app manages `created_at` and `updated_at` only during explicit create/save operations

## Hard boundaries

For this first task, do not implement:

- editor behavior
- workspace/file explorer behavior
- note CRUD
- search/indexing
- Git integration
- settings UI
- AI
- sync
- graph
- canvas
- public extensions
- marketplace

Only scaffold the project.

## Expected scaffold output

Create or configure:

- root `package.json`
- `pnpm-workspace.yaml`
- root TypeScript/lint/test/build config as appropriate
- `apps/desktop`
- `packages/core`
- `packages/ui`
- Tauri v2 + Vite + React baseline
- Zustand dependency/setup
- Vitest setup
- Playwright setup
- root scripts:

  ```bash
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm test:e2e
  pnpm build
  ```

- minimal placeholder UI only if needed to prove the app boots

## Sub-agent strategy

Use sub-agents only where useful. The first work item is mostly scaffold work, so avoid over-splitting too early.

Recommended split:

### Parent agent

Owns final coordination and root scaffold decisions.

The parent agent should personally handle or closely supervise:

- root workspace config
- package manager setup
- script naming
- final validation
- integration of all sub-agent outputs

### Sub-agent A: Frontend scaffold review/setup

Assign only if useful.

Scope:

- `apps/desktop/src/**`
- React/Vite baseline
- minimal app component
- Zustand placeholder store if needed
- import/use `packages/ui` minimally

Must not touch:

- root package manager decisions unless asked
- Tauri Rust internals
- product features

### Sub-agent B: UI package scaffold

Assign only if useful.

Scope:

- `packages/ui/**`
- design token structure
- minimal reusable components
- CSS variable foundation

Must not implement full app styling or product UI.

### Sub-agent C: Core package scaffold

Assign only if useful.

Scope:

- `packages/core/**`
- package exports
- placeholder domain modules/types only if needed
- no real note/search/workspace logic yet

Must not implement product behavior.

### Sub-agent D: Testing scaffold

Assign only after basic package/app structure exists.

Scope:

- Vitest config
- Playwright config
- smoke tests
- validation scripts

Must not suppress failures to make tests pass.

## After scaffolding

Run the narrowest available validation first, then broader validation:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

If Tauri/Rust files exist, also run:

```bash
cargo test
```

Report exactly:

- what changed
- which files were created/modified
- which validation commands passed
- which failed and why
- any follow-up decisions needed before assigning `plans/work-items/002-desktop-tauri-shell.md`
```

A shorter version you can paste if you want less ceremony:

```md
Read `plans/000-agent-entrypoint.md`, then the core planning docs through `plans/006-testing-strategy.md`, then `plans/work-items/000-first-agent-instructions.md` and `plans/work-items/001-project-scaffold.md`.

Act as the parent implementation agent. Implement only Work Item 001: Project Scaffold.

Use `pnpm`, plain workspaces, Tauri v2, React, TypeScript, Vite, Zustand, Vitest, Playwright, `apps/desktop`, `packages/core`, and `packages/ui`.
gl
Do not implement product features yet. No editor, workspace explorer, search, Git, settings UI, AI, sync, graph, canvas, marketplace, or public extensions.

Use sub-agents only if helpful:
- one for `packages/ui`
- one for `packages/core`
- one for frontend/Vite scaffold
- one for test/Playwright/Vitest setup after structure exists

Parent agent owns integration, root scripts, and validation.

Expected root commands:
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`.

Run validation and report what passed/failed.