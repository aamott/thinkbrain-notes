# Work Item 001: Project Scaffold

## Status

Planned

## Goal

Create the initial repository scaffold for a desktop-first Tauri, React, TypeScript, and Vite application with shared packages for core logic and UI.

## Required Reading

- `plans/000-agent-entrypoint.md`
- `plans/004-technical-decisions.md`
- `plans/005-mvp-scope.md`
- `plans/006-testing-strategy.md`
- `plans/architecture/app-architecture.md`

## Scope

Implement or prepare:

- package manager workspace configuration
- `apps/desktop` application folder
- `packages/core` package
- `packages/ui` package
- shared TypeScript configuration
- lint, typecheck, test, and build scripts
- Vite + React baseline
- Tauri baseline if dependencies/tooling are available
- minimal placeholder UI that proves the app boots

## Non-Goals

Do not implement:

- editor behavior
- workspace browser
- file operations beyond scaffold needs
- search/indexing
- Git integration
- settings UI
- AI, sync, graph, canvas, marketplace, or public extensions

## Dependencies

None, but several decisions may need user confirmation before implementation.

## Owns

The agent may edit:

- root package/config files
- `apps/desktop/**`
- `packages/core/**`
- `packages/ui/**`
- project-level TypeScript/lint/test config files

## Interfaces

Establish scripts or documented equivalents for:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Acceptance Criteria

- [ ] Workspace layout exists.
- [ ] Desktop app can be installed/built or has clearly documented setup blockers.
- [ ] TypeScript config is present.
- [ ] Test runner is present or intentionally deferred with explanation.
- [ ] Root scripts provide stable commands for future agents.
- [ ] No product feature scope was implemented.

## Validation

Run available scaffold validation commands. If dependencies are installed:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

If Tauri/Rust files exist:

```bash
cargo test
```

## Notes for Parent Agent

This should be the first implementation task. Do not assign feature work until scaffold command names and package locations are stable.
