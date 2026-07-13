# Story: GitHub Actions CI workflow

**Status:** pending · **Urgency:** med · **Difficulty:** med

## Goal

A GitHub Actions workflow that runs the agreed validation commands on push and
PR so regressions are caught before merge.

## Acceptance Criteria

- [ ] `.github/workflows/ci.yml` exists.
- [ ] Workflow runs on push and pull_request.
- [ ] Job installs pnpm (matching `packageManager: pnpm@11.8.0`) and Node.
- [ ] Workflow runs: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm test:e2e`, `pnpm build`.
- [ ] Workflow runs `cargo test --manifest-path
  apps/desktop/src-tauri/Cargo.toml` (Rust toolchain job).
- [ ] Playwright browsers installed for the e2e step
  (`pnpm exec playwright install --with-deps chromium`).
- [ ] Failures are visible and not suppressed (no `|| true`, no continue-on-error
  on validation steps).
- [ ] Workflow file committed and green on a sample run.

## References

- `package.json` (root scripts)
- `apps/desktop/playwright.config.ts` (`reuseExistingServer` keyed on `CI`)
- `apps/desktop/src-tauri/Cargo.toml`
- `plans/testing-strategy.md` → Agent Validation Rule
- `.agents/AGENTS.md` → Linting (fail loudly)

## Notes

- "if appropriate" per epic scope — confirm with user whether GitHub is the
  intended remote before investing; if the repo is local-only, document the
  decision and close this story.
- Cache pnpm store and cargo target for speed.
- Consider matrix OS later; start with a single Linux job.
