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
  If a target ever refuses to build it, the fallback is steering rustls to the
  `ring` provider; both are C, but `ring`'s mobile support is better trodden.

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
- [ ] **CI proves both mobile targets.** Added but unrun — this goes green or
      red on the first push, and a red here changes the epic, not the story.

## Status

🟨 Local half done; the mobile half is waiting on its first CI run.
