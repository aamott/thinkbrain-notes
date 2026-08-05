#!/usr/bin/env bash
# scripts/qa.sh — Unified quality-assurance runner.
# Runs lint, typecheck, and tests across the entire monorepo.
# Defaults to quiet output; pass --verbose for full output.

set -euo pipefail

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
