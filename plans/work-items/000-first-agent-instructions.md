# First Agent Instructions

This is the starting prompt for the first implementation agent, likely the next session.

## Role

You are the first implementation agent for the note app. Your job is to prepare the project scaffold only. Do not implement product features yet.

## Read First

Read these documents in order:

1. `plans/000-agent-entrypoint.md`
2. `plans/001-project-overview.md`
3. `plans/002-core-principles.md`
4. `plans/003-roadmap.md`
5. `plans/004-technical-decisions.md`
6. `plans/005-mvp-scope.md`
7. `plans/006-testing-strategy.md`
8. `plans/architecture/app-architecture.md`
9. `plans/work-items/001-project-scaffold.md`

## Assignment

Implement `plans/work-items/001-project-scaffold.md`.

## Primary Goal

Create a clean desktop-first project scaffold that future agents can build on safely.

## Hard Boundaries

Do not implement:

- editor features
- workspace/file explorer features
- search/indexing
- Git UI
- settings UI
- AI
- sync
- graph
- canvas
- public extensions
- marketplace

## Expected Output

The scaffold should establish:

- package manager workspace files
- desktop app folder
- shared package folders
- TypeScript configuration
- lint/typecheck/test/build scripts or documented equivalents
- Tauri/Vite/React baseline if the technical decisions are confirmed
- minimal placeholder UI only if needed to verify the app boots

## Decision Check Before Starting

Before making irreversible scaffold choices, check whether these have been decided:

1. package manager: `pnpm`?
2. build orchestration: plain `pnpm` workspaces or Turborepo?
3. Tauri major version?
4. React app style: Vite SPA only, no router initially?
5. test stack: Vitest now, Playwright later?

If a decision is still pending and blocks implementation, ask the user instead of guessing.

## Validation

After scaffolding, run the narrowest available validation commands, ideally:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

If Tauri/Rust code exists, also run:

```bash
cargo test
```

Report exactly what passed, failed, or could not run.
