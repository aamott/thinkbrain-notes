#!/usr/bin/env bash
# Disposable GitLab proof for git sync (story 6c leftover).
#
# Requires `glab` authenticated (or GITLAB_TOKEN) with permission to create
# and delete a private project. Creates an empty project, runs the ignored
# live_host cargo test, then deletes the project. Never prints the token.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=rust-env.sh
source "$ROOT/scripts/rust-env.sh"

if ! command -v glab >/dev/null 2>&1; then
  echo "glab is not installed; cannot run live GitLab proof" >&2
  exit 1
fi

LOGIN="$(glab api user | sed -n 's/.*"username"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
if [[ -z "$LOGIN" ]]; then
  echo "glab is not authenticated; run: glab auth login" >&2
  exit 1
fi

NAME="tb-sync-proof-$(date +%s)-$RANDOM"
FULL="$LOGIN/$NAME"
URL="https://gitlab.com/${FULL}.git"

cleanup() {
  glab repo delete "$FULL" -y >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Creating disposable private project $FULL"
glab repo create "$NAME" --private --description "ThinkBrain Notes disposable sync proof — delete me" >/dev/null

export TB_SYNC_LIVE_URL="$URL"
export TB_SYNC_LIVE_USER="$LOGIN"
if [[ -n "${GITLAB_TOKEN:-}" ]]; then
  export TB_SYNC_LIVE_TOKEN="$GITLAB_TOKEN"
else
  # glab stores a token; prefer an explicit env var when available.
  echo "Set GITLAB_TOKEN to a personal access token with api + write_repository" >&2
  exit 1
fi

echo "Running live host proof against $URL"
cargo test --manifest-path "$ROOT/apps/desktop/src-tauri/Cargo.toml" \
  --lib live_host \
  -- --ignored --nocapture --test-threads=1

echo "Live GitLab proof passed; deleting $FULL"
