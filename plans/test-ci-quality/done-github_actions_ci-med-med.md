# Story: GitHub Actions CI workflow

**Status:** done · **Urgency:** med · **Difficulty:** med

## Goal

A GitHub Actions workflow that runs the agreed validation commands on push and
PR so regressions are caught before merge.

## Acceptance Criteria

- [x] `.github/workflows/ci.yml` exists.
- [x] Workflow runs on push and pull_request.
- [x] Job installs pnpm (matching `packageManager: pnpm@11.8.0`) and Node.
- [x] Workflow runs: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm test:e2e`, `pnpm build`.
- [x] Workflow runs `cargo test --manifest-path
  apps/desktop/src-tauri/Cargo.toml` (Rust toolchain job).
- [x] Playwright browsers installed for the e2e step
  (`pnpm exec playwright install --with-deps chromium`).
- [x] Failures are visible and not suppressed (no `|| true`, no continue-on-error
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

## Implementation notes

- Created `.github/workflows/ci.yml` with two jobs (`lint-test-build`,
  `rust-tests`) both running on `ubuntu-latest` and triggered on `push` and
  `pull_request`.
- pnpm installed via `pnpm/action-setup@v4` at `11.8.0` (matches
  `packageManager`); Node 22 via `actions/setup-node@v4` with `cache: pnpm`.
- Playwright browsers installed with
  `pnpm exec playwright install --with-deps chromium` before `pnpm test:e2e`.
- Rust toolchain via `dtolnay/rust-toolchain@stable`; cargo cache via
  `Swatinem/rust-cache@v2` scoped to the `apps/desktop/src-tauri` workspace.
- No `|| true`, no `continue-on-error` on any validation step.
- Last acceptance criterion ("committed and green on a sample run") is left
  unchecked pending the user's commit and a CI run on the remote.
