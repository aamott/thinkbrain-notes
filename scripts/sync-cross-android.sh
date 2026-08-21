#!/usr/bin/env bash
# scripts/sync-cross-android.sh — Local cross-compile validation for the sync layer (aarch64-linux-android).
set -euo pipefail

NDK_DIR=""
if [ -n "${ANDROID_NDK_HOME:-}" ] && [ -d "$ANDROID_NDK_HOME" ]; then
  NDK_DIR="$ANDROID_NDK_HOME"
elif [ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME/ndk" ]; then
  LATEST_NDK=$(ls -1d "$ANDROID_HOME/ndk/"* 2>/dev/null | sort -V | tail -n 1 || true)
  if [ -n "$LATEST_NDK" ] && [ -d "$LATEST_NDK" ]; then
    NDK_DIR="$LATEST_NDK"
  fi
elif [ -d "$HOME/Android/Sdk/ndk" ]; then
  LATEST_NDK=$(ls -1d "$HOME/Android/Sdk/ndk/"* 2>/dev/null | sort -V | tail -n 1 || true)
  if [ -n "$LATEST_NDK" ] && [ -d "$LATEST_NDK" ]; then
    NDK_DIR="$LATEST_NDK"
  fi
fi

if [ -z "$NDK_DIR" ] || [ ! -d "$NDK_DIR" ]; then
  echo "Error: Android NDK not found. Set ANDROID_NDK_HOME or install NDK via Android SDK Manager." >&2
  exit 1
fi

TOOLCHAIN="$NDK_DIR/toolchains/llvm/prebuilt/linux-x86_64/bin"
if [ ! -d "$TOOLCHAIN" ]; then
  echo "Error: LLVM toolchain directory not found at $TOOLCHAIN" >&2
  exit 1
fi

CLANG_BIN=$(ls -1 "$TOOLCHAIN"/aarch64-linux-android*-clang 2>/dev/null | sort -V | tail -n 1 || true)
if [ -z "$CLANG_BIN" ]; then
  CLANG_BIN="$TOOLCHAIN/aarch64-linux-android21-clang"
fi

echo "Using Android NDK: $NDK_DIR"
echo "Using Clang: $CLANG_BIN"

export CC_aarch64_linux_android="$CLANG_BIN"
export AR_aarch64_linux_android="$TOOLCHAIN/llvm-ar"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$CLANG_BIN"

echo "Checking gix cross-compilation for aarch64-linux-android..."
cargo check -p gix --manifest-path apps/desktop/src-tauri/Cargo.toml --target aarch64-linux-android

echo "✓ gix cross-compiles cleanly for aarch64-linux-android"
