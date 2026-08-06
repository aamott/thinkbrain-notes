#!/usr/bin/env bash
# scripts/rust-env.sh — Autodetect and enable Rust build accelerators.
#
# Source this file (do NOT execute it) to detect sccache, mold, and clang and
# export the Cargo environment variables that enable them. Tools that are
# missing are silently skipped, so devs without them get no warnings and no
# link failures.
#
#   source scripts/rust-env.sh
#
# This is sourced automatically by:
#   - scripts/with-rust-env.sh (used by npm scripts: test:rust, desktop:run,
#     desktop:tauri) — so `pnpm desktop:tauri dev` picks up sccache/mold with
#     no manual step.
#   - scripts/qa.sh (for its Rust test step).
#
# To enable in an ad-hoc shell (e.g. running `cargo` by hand), source it
# directly. To make it permanent, add to your ~/.bashrc or ~/.zshrc:
#   [ -f /path/to/thinkbrain-notes/scripts/rust-env.sh ] && \
#     source /path/to/thinkbrain-notes/scripts/rust-env.sh
#
# Why env vars and not .cargo/config.toml?
#   Cargo's config hierarchy is by directory depth (no same-dir overlay), and a
#   committed config that hardcodes sccache/mold emits a benign warning on
#   machines without sccache and breaks linking on Linux without mold/clang.
#   Env vars take precedence over config files (per Cargo's docs) and propagate
#   to tauri-cli's cargo subprocess. Re-sourcing re-detects, so there is no
#   setup step to re-run when tools are installed or removed.

# Detect sccache: caches compiled crate artifacts across builds/checkouts.
# Big win for Tauri's large dependency tree which rarely changes between edits.
if command -v sccache >/dev/null 2>&1; then
  export RUSTC_WRAPPER="sccache"
  echo "rust-env: sccache enabled ($(command -v sccache)). Stats: sccache --show-stats"
else
  unset RUSTC_WRAPPER
  echo "rust-env: sccache not found; skipping (install: sudo apt install sccache)"
fi

# Detect mold + clang for fast linking on Linux x86_64 only.
# clang is used as the linker frontend because it reliably forwards
# `-fuse-ld=mold` to the linker; passing `mold` directly as `linker` can
# mis-handle rustc's flag passing.
if [ "$(uname -s)" = "Linux" ] && [ "$(uname -m)" = "x86_64" ]; then
  if command -v mold >/dev/null 2>&1 && command -v clang >/dev/null 2>&1; then
    # CARGO_TARGET_<TRIPLE>_RUSTFLAGS overrides rustflags for this target only,
    # leaving other targets (e.g. cross-compiles) unaffected.
    export CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_RUSTFLAGS="-C linker=clang -C link-arg=-fuse-ld=mold"
    echo "rust-env: mold+clang enabled for x86_64-unknown-linux-gnu"
  else
    unset CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_RUSTFLAGS
    if ! command -v mold >/dev/null 2>&1; then
      echo "rust-env: mold not found; skipping (install: sudo apt install mold)"
    fi
    if ! command -v clang >/dev/null 2>&1; then
      echo "rust-env: clang not found; skipping (install: sudo apt install clang)"
    fi
  fi
else
  unset CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_RUSTFLAGS
fi

# Sourcing this helper must never fail the caller when an optional tool is absent.
true
