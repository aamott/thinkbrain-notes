# Node 22 Runtime and Launch Verification

## Goal

Make the project’s declared pnpm 11 toolchain reproducible and prove the fresh
desktop shell launches in both the browser harness and the Tauri desktop path.
No deleted desktop UI or CSS may be restored to satisfy a check.

## Acceptance Criteria

- [x] The repository declares Node 22.13+ as required by `pnpm@11.8.0`, with a
      developer-visible version file and package engine constraint.
- [x] Root lint excludes standalone visual/reference applications, including
      `mockup_v3/`, while continuing to lint every production package.
- [x] Root `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and
      `pnpm build` all pass under the declared Node runtime, with no skipped or
      suppressed failures.
- [x] The desktop browser harness asserts the fresh shell’s real landmarks and
      interactions rather than deleted UI controls or copy.
- [x] The Vite desktop app starts and serves a healthy page; the Tauri app
      compiles and has a bounded launch smoke check when a display is available.
- [x] Native test validation passes, including cross-platform frontend path
      normalization for Windows-style input.
- [x] Any unavailable UI remains explicit and has no fabricated workspace,
      agent, terminal, or indexer state.

## References

- `package.json`
- `.nvmrc`
- `apps/desktop/{playwright.config.ts,e2e/app.spec.ts}`
- `apps/desktop/src/{App.tsx,main.tsx,shell/,agent/}`
- `plans/ui-shell/done-mockup_v3_shell_rebuild-high-hard.md`

## Launch verification (2026-07-18)

- Passed from `apps/desktop/` without pnpm/Corepack:
  `../../node_modules/.bin/tsc --noEmit -p tsconfig.json`,
  `../../node_modules/.bin/eslint src/App.tsx src/main.tsx src/shell src/agent --max-warnings=0`,
  `../../node_modules/.bin/vite build`, and
  `cargo check --quiet --manifest-path src-tauri/Cargo.toml`.
- `cargo build --quiet --manifest-path src-tauri/Cargo.toml` produced the
  debug desktop binary. A bounded smoke command,
  `timeout 8s src-tauri/target/debug/thinkbrain-notes-desktop`, kept the app
  alive until the intentional timeout with no application error. GTK/WebKit
  reported only sandbox display/cache warnings.
- `./node_modules/.bin/tauri build --debug --no-bundle` cannot currently run
  in this host: before it executes its configured frontend command, the Tauri
  CLI native binding panics in `crates/tauri-cli/src/interface/rust.rs:146`
  with `Too many open files` (OS error 24). This remains true outside the
  workspace filesystem sandbox.
- The same host has exhausted its low per-user inotify instance allowance
  (`/proc/sys/fs/inotify/max_user_instances` is `128`), so an ordinary Vite
  dev start can fail watching `vite.config.ts` with `EMFILE`. The issue is not
  caused by the desktop watcher configuration: `CHOKIDAR_USEPOLLING=true
  CHOKIDAR_INTERVAL=250 ../../node_modules/.bin/vite --host 127.0.0.1 --port
  1421 --strictPort` served `HTTP/1.1 200 OK`, then the process was stopped.
  Polling is an operator workaround, not a project default because it has a
  continuous CPU cost. Do not change host-wide limits or hide this failure in
  scripts.
