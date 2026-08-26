---
name: android-dev
description: Android development and build workflow for ThinkBrain Notes. Applies when building, running, debugging, or deploying the Tauri Android app to an emulator or device. Covers the terminal-first build flow, why Android Studio's build button fails, and how to install/deploy APKs.
---

# Android Development Workflow

## Key Rule: Build from the Terminal, Not Android Studio

Android builds **must** be initiated from the terminal via the Tauri CLI. Android Studio's "Build" or "Run" button calls Gradle directly, which panics with exit code 134 (SIGABRT):

```
thread '<unnamed>' panicked at crates/tauri-cli/src/mobile/mod.rs:
failed to read CLI options: Context("failed to build WebSocket client",
Io(Os { code: 111, kind: ConnectionRefused, message: "Connection refused" }))
```

This is by design. The `android-studio-script` command is a **callback**, not a standalone build command. The flow is:

1. `tauri android dev`/`build` starts → launches a WebSocket coordination server
2. Tauri invokes Gradle
3. Gradle's `rustBuild*` tasks call `tauri android android-studio-script` → connects back to that server to read CLI options
4. Tauri does the Rust compilation and hands `.so` files to Gradle

When Android Studio runs Gradle directly, step 1 never happens, so step 3 aborts. Tracked upstream at [tauri#9701](https://github.com/tauri-apps/tauri/issues/9701).

## Build Commands

| Task | Command | Notes |
|------|---------|-------|
| Dev (hot reload + deploy) | `pnpm android:dev` | Incremental Rust build, hot-reloads frontend, deploys to connected device/emulator |
| Debug APK + AAB | `pnpm android:build` | Full universal debug build (~626MB, all ABIs) |
| Release APK + AAB | `pnpm android:build:release` | Production build |

All commands go through `scripts/with-rust-env.mjs` which auto-enables sccache/mold/clang if installed.

## Deploying an Existing APK

If an APK is already built and you just want to push it to a device:

```bash
# List connected devices/emulators
adb devices

# Install the debug APK
adb install -r apps/desktop/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk

# Launch the app
adb shell am start -n com.thinkbrain.notes/.MainActivity
```

The debug build's package name is `com.thinkbrain.notes` (no `.debug` suffix).

## Android Studio's Role

Android Studio is useful for everything **except** initiating the build:

- **Emulator**: Tools → Device Manager → start/stop AVDs
- **Logcat**: View Android logs, filter by `Tauri` tag
- **Native debugging**: Attach to a running app process
- **Manifest/resources**: Read-only inspection

## Emulator Quick Reference

```bash
# List available AVDs
$ANDROID_HOME/emulator/emulator -list-avds

# Check what's running
adb devices

# View app logs
adb logcat -s Tauri:*
```
