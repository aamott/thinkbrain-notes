# Work Item 010: Test, CI, and Quality

## Status

Planned

## Goal

Create the quality checks and CI workflow that keep the project maintainable as multiple agents contribute.

## Required Reading

- `plans/004-technical-decisions.md`
- `plans/005-mvp-scope.md`
- `plans/006-testing-strategy.md`
- existing project scaffold/config files

## Scope

Implement:

- stable root validation scripts
- Vitest configuration
- Playwright E2E configuration
- Rust test command documentation or integration
- lint configuration
- typecheck configuration
- GitHub Actions workflow if appropriate
- minimal smoke tests for scaffold and core packages
- minimal E2E smoke test for app boot

## Non-Goals

Do not rewrite product features purely for test convenience. Do not suppress errors to make CI pass.

## Dependencies

- `001-project-scaffold.md`

## Owns

- test config
- lint config
- CI config
- smoke tests
- test documentation

## Acceptance Criteria

- [ ] `pnpm lint` exists or has a documented equivalent.
- [ ] `pnpm typecheck` exists or has a documented equivalent.
- [ ] `pnpm test` exists or has a documented equivalent.
- [ ] `pnpm test:e2e` exists or has a documented equivalent.
- [ ] `pnpm build` exists or has a documented equivalent.
- [ ] CI runs the agreed validation commands.
- [ ] Failures are visible and not suppressed.

## Validation

Run all configured validation commands and report results.
