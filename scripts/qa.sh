#!/usr/bin/env bash
# scripts/qa.sh — Unified quality-assurance runner.
# Runs lint, typecheck, and tests across the entire monorepo.

set -euo pipefail

# Auto-enable sccache/mold for the Rust test step if available. Sourcing is
# optional and silently skips missing tools, so this never breaks QA.
# shellcheck source=./rust-env.sh
if [ -f "$(dirname "$0")/rust-env.sh" ]; then
  # shellcheck disable=SC1091
  source "$(dirname "$0")/rust-env.sh" >/dev/null
fi

# Note: do not pass --quiet to eslint. It suppresses warnings, which
# hides Tailwind CSS conflict detection (eslint-plugin-tailwindcss rules
# are set to "warn"). Warnings need to be visible to get cleaned up.
echo "▸ Lint"
pnpm lint

echo "▸ Typecheck"
pnpm typecheck

echo "▸ Test (TypeScript)"
pnpm test

echo "▸ Test (Rust)"
pnpm test:rust

echo ""
echo "✓ All checks passed."
