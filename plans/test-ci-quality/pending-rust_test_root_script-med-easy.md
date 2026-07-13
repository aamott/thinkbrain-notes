# Story: Root convenience script for Rust tests

**Status:** pending · **Urgency:** med · **Difficulty:** easy

## Goal

Add a root `pnpm test:rust` script so agents can run the Tauri/Rust test suite
without remembering the `cargo test --manifest-path ...` incantation.

## Acceptance Criteria

- [ ] `package.json` (root) has a `test:rust` script invoking
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`.
- [ ] `pnpm test:rust` passes from the repo root.
- [ ] Command documented in `plans/testing-strategy.md` Expected Commands
  section.

## References

- `package.json` (root `scripts`)
- `apps/desktop/src-tauri/Cargo.toml`
- `plans/testing-strategy.md` → Expected Commands

## Notes

- Keep the explicit manifest path so the script works regardless of cwd.
- Do not fold this into `pnpm test` (Rust toolchain may be unavailable in some
  environments); keep it opt-in.
