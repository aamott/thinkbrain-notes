#!/usr/bin/env bash
# Disposable GitHub proof for git sync (story 6c leftover).
#
# Creates a private empty repo, runs the ignored live_host cargo test with a
# short-lived token from `gh`, then deletes the repo. Never prints the token.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=rust-env.sh
source "$ROOT/scripts/rust-env.sh"

LOGIN="$(gh api user --jq .login)"
NAME="tb-sync-proof-$(date +%s)-$RANDOM"
FULL="$LOGIN/$NAME"
URL="https://github.com/${FULL}.git"

cleanup() {
  gh repo delete "$FULL" --yes >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Creating disposable private repo $FULL"
gh repo create "$FULL" --private --description "ThinkBrain Notes disposable sync proof — delete me" >/dev/null

export TB_SYNC_LIVE_URL="$URL"
export TB_SYNC_LIVE_USER="$LOGIN"
# Prefer x-access-token for HTTPS; the OAuth token from `gh` is the password.
TB_SYNC_LIVE_TOKEN="$(gh auth token)"
export TB_SYNC_LIVE_TOKEN

echo "Running live host proof against $URL"
cargo test --manifest-path "$ROOT/apps/desktop/src-tauri/Cargo.toml" \
  --lib live_host \
  -- --ignored --nocapture --test-threads=1

echo "Live GitHub proof passed; deleting $FULL"
