#!/usr/bin/env bash
# scripts/with-rust-env.sh — Run a command with Rust build accelerators enabled.
#
# Sources rust-env.sh (autodetects sccache/mold/clang, silently skips missing
# tools) then execs the remaining args. Used by npm scripts so that
# `pnpm desktop:tauri dev`, `pnpm test:rust`, `pnpm desktop:run`, etc.
# automatically pick up sccache/mold without manually sourcing rust-env.sh
# per shell.
#
#   bash scripts/with-rust-env.sh cargo test --manifest-path ...
#
# Missing tools are silently skipped (rust-env.sh handles that), so unequipped
# devs get plain cargo with no warnings or link failures.

# shellcheck source=./rust-env.sh
source "$(dirname "$0")/rust-env.sh" >/dev/null

exec "$@"
