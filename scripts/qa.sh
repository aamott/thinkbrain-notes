#!/usr/bin/env bash
# scripts/qa.sh — Unified quality-assurance runner.
# Runs lint, typecheck, and tests across the entire monorepo.
# Defaults to quiet output; pass --verbose for full output.

set -euo pipefail

# Auto-enable sccache/mold for the Rust test step if available. Sourcing is
# optional and silently skips missing tools, so this never breaks QA.
# shellcheck source=./rust-env.sh
if [ -f "$(dirname "$0")/rust-env.sh" ]; then
  # shellcheck disable=SC1091
  source "$(dirname "$0")/rust-env.sh" >/dev/null
fi

VERBOSE=false
for arg in "$@"; do
  case "$arg" in
    --verbose|-v) VERBOSE=true ;;
  esac
done

if [ "$VERBOSE" = true ]; then
  QUIET_FLAG=""
else
  QUIET_FLAG="--quiet"
fi

echo "▸ Lint"
pnpm lint $QUIET_FLAG

echo "▸ Typecheck"
pnpm typecheck

echo "▸ Test (TypeScript)"
pnpm test

echo "▸ Test (Rust)"
pnpm test:rust

echo ""
echo "✓ All checks passed."
