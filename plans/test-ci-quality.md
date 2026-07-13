# Epic: Test, CI, and Quality

> Quality checks and CI workflow that keep the project maintainable as multiple
> agents contribute. Read `plans/testing-strategy.md` alongside this epic.

## Goal

Provide stable, reproducible validation commands and CI that every agent runs
before declaring work done. Failures must be visible and never suppressed.

## Scope

- Stable root validation scripts: `pnpm lint`, `typecheck`, `test`, `test:e2e`,
  `build`.
- Vitest configuration for frontend and shared TypeScript packages.
- Playwright E2E configuration for the desktop browser harness.
- Rust test command — documented and/or integrated as a root convenience
  script.
- Lint configuration (ESLint flat config).
- Typecheck configuration (per-package `tsc --noEmit` wired through
  `pnpm -r typecheck`).
- GitHub Actions workflow running the agreed validation commands (if
  appropriate).
- Minimal smoke tests for the scaffold and `packages/core` / `packages/ui`.
- Minimal E2E smoke test confirming the app boots in the browser harness.

## Architecture Decisions

- **Vitest** for all TypeScript unit/integration tests. `apps/desktop` uses an
  explicit `vitest/config` block inside `vite.config.ts`; `packages/core` and
  `packages/ui` run `vitest run` against defaults (no DOM needed).
- **Playwright** drives the desktop app via the Vite dev server on
  `127.0.0.1:1420` (`apps/desktop/playwright.config.ts`). Tauri-specific E2E is
  deferred until the desktop shell is stable enough.
- **ESLint flat config** at the repo root (`eslint.config.js`); per-package
  `lint` scripts delegate to it.
- **Typecheck** is per-package `tsc --noEmit` aggregated by `pnpm -r
  typecheck`; the root `tsconfig.json` is a solution-style project reference
  tree over `tsconfig.base.json`.
- **Rust tests** live inline in `apps/desktop/src-tauri/src/lib.rs` under
  `#[cfg(test)]` and run via `cargo test --manifest-path
  apps/desktop/src-tauri/Cargo.toml`.
- Fail loudly: agents must not suppress failures to make CI pass
  (`plans/testing-strategy.md` → Agent Validation Rule).

## Non-Goals

- Rewriting product features purely for test convenience.
- Suppressing errors to make CI pass.
- Tauri-native E2E (deferred until the shell is stable).
- Broad coverage targets — minimal smoke coverage is the bar for this epic.

## Status

- ✅ root validation scripts (`lint`, `typecheck`, `test`, `test:e2e`, `build`) — `package.json`
- ✅ Vitest configuration (desktop explicit; core/ui defaults) — `apps/desktop/vite.config.ts`
- ✅ Playwright E2E configuration — `apps/desktop/playwright.config.ts`
- ✅ Rust tests documented and passing — `apps/desktop/src-tauri/src/lib.rs`, `plans/archive/.../STATUS.md`
- ✅ lint configuration (ESLint flat config) — `eslint.config.js`
- ✅ typecheck configuration (per-package `tsc --noEmit`) — `tsconfig.base.json`, per-package `tsconfig.json`
- ✅ smoke tests for core/ui/desktop packages — `packages/core/src/*.test.ts`, `packages/ui/src/lib/classNames.test.ts`, `apps/desktop/src/**/*.test.ts`
- ✅ E2E smoke test for app boot — `apps/desktop/e2e/app.spec.ts`
- ⬜ root convenience script for Rust tests (`pnpm test:rust`) — not yet in `package.json`
- ⬜ GitHub Actions CI workflow — no `.github/workflows/` directory exists
