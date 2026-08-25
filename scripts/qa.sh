#!/usr/bin/env bash
# scripts/qa.sh — Unified quality-assurance runner.
#
# Runs lint, typecheck, Rust formatting, and all tests across the monorepo.
# Delegates to scripts/qa.mjs so the same logic runs cross-platform via
# `pnpm qa` (or `node scripts/qa.mjs`) on Windows PowerShell / cmd, while
# `./scripts/qa.sh` keeps working on Unix.
#
# Rust build accelerators (sccache/mold) are applied by the test:rust script,
# which routes through scripts/with-rust-env.mjs -> with-rust-env.sh on Unix.

exec node "$(dirname "$0")/qa.mjs" "$@"
