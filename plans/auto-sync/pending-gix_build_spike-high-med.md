# gix Build Spike

Split off the front of story 1 (`pending-gix_engine_hidden_repo-high-hard.md`).
Everything in the epic rests on one assumption — that gix compiles everywhere
the app ships — and that assumption is cheap to test and expensive to discover
late. Nothing else in story 1 should start until this is green.

## What it proves

1. gix builds into the desktop crate with the feature set sync actually needs
   (three-way merge, worktree mutation, HTTPS transport for push/pull).
2. A repository can live in app-data and treat the vault as its worktree, with
   nothing written inside the vault.
3. The same dependency cross-compiles for Android and iOS.

## Findings

- **The bet mostly holds, with one caveat worth writing down.** gix itself is
  pure Rust, but `blocking-http-transport-reqwest-rust-tls` pulls rustls, whose
  default crypto provider is `aws-lc-rs` → `aws-lc-sys`: a BoringSSL fork in C
  and assembly that needs a cross C toolchain per target. "gix, so no OpenSSL"
  was the right call; "so it is pure Rust end to end" was not. Note that the
  desktop build already carried this — `tauri-plugin-updater` depends on the
  same rustls — so it is new only for mobile.
  Both mobile targets do build it, so this is a constraint to keep an eye on
  rather than a problem. If one ever refuses, the fallback is steering rustls to
  the `ring` provider; both are C, but `ring`'s mobile support is better trodden.

- **gix has no separate-worktree `init`.** `create::Kind` is `WithWorktree` or
  `Bare`, nothing in between. The hidden repo is therefore created bare and then
  un-bared by writing `core.bare = false` and `core.worktree = <vault>`, which
  is what `git init --separate-git-dir` does and what gix reads back on open.

- **`config_snapshot_mut().commit()` does not write the config file.** It
  updates the in-memory configuration and returns; the file is untouched. A
  repository "configured" that way reads back as bare on the next open, which is
  how this was found. `point_at_worktree` writes the file itself via
  `gix::config::File`. Anything later that changes repository config (story 6's
  remote URL) must do the same.

- **The cross-compile gate cannot run on a Linux dev machine.** Android needs
  the NDK; iOS needs macOS. It runs in CI instead, as `sync-cross-compile` in
  `ci.yml`, checking the `gix` package alone against `aarch64-linux-android` and
  `aarch64-apple-ios`. Story 8 keeps that gate and adds the smoke tests.

## Acceptance

- [x] gix compiles into the desktop crate with merge, worktree-mutation and
      HTTPS transport enabled
- [x] A hidden repo in app-data claims the vault as its worktree and writes
      nothing into the vault; reopening finds the same repository
- [x] Guards are mutation-tested: dropping `core.worktree`, dropping
      `core.bare`, or re-creating over an existing repo each fail a test
- [x] **CI proves both mobile targets.** `aarch64-linux-android` and
      `aarch64-apple-ios` both green on the first run (2026-08-16), aws-lc-sys
      included. The gate stays in `ci.yml`, so a dependency change that breaks
      portability fails on the commit that causes it.

## Status

✅ Done. The gix bet is tested rather than assumed; story 1 can build on it.
