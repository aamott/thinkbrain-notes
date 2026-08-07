# Source-Control Sidebar Panel Completion

## Goal

Finish the current fresh-shell Source Control contribution so availability,
repository init, status, staging, commit, branch metadata, errors, and diff
opening are coherent and accessible. The panel is an integration story; domain
Git behavior remains in `gitService.ts`/Rust commands.

## Discovery questions — answer before UI work

- Which status groups are visible by default (staged, changed, untracked), and do
  empty groups collapse? Define rename/copy/deletion labels and counts.
- Is commit message input always visible or collapsed until staged files exist?
  Define keyboard submit, focus, and success/error announcements.
- Does clicking a file open an inline diff in the existing editor tab area, a panel
  subview, or a modal? Define behavior for binary/untracked files and deleted files.
- What should be retained when switching workspaces or closing/reopening the panel:
  message, expansion, branch list, and selected diff?
- What must the 760px/narrow and Tauri mobile layouts do with action buttons and
  long paths? Define touch target and horizontal overflow rules.

**STOP gate:** No mockups, JSX, CSS, icon changes, or screenshot review until the
answers are recorded. After approval, use the existing contribution registry,
co-located CSS Modules, and shared `--tn-*` tokens; do not use Tailwind utility
classes or implement the obsolete `ActivePanel`, `appStore`, `ActiveSidePanel`,
`App.tsx`, or `styles.css` architecture described by the old story.

## Implementation-ready acceptance criteria

- [ ] Keep `apps/desktop/src/panels/panelRegistry.tsx` as the activity-bar/sidebar
  registration seam (`id: "source-control"`, left side, `keepMounted`); verify
  `ActivityBar.tsx`, `LeftPopout.tsx`, and `shell/shellTypes.ts` select it through
  `LeftPanel`. Do not duplicate registration in `App.tsx`.
- [ ] Complete `SourceControlPanelState` in `apps/desktop/src/git/SourceControlPanel.tsx`
  for no workspace, loading, Git missing, native typed error, not-repository/init,
  repository, mutation-in-flight, commit success, branch metadata, and diff
  selection; stale responses must be rejected via `sourceControlRequestGate.ts`.
- [ ] Wire `gitService` methods for status, stage/unstage, commit, branches, and
  diff; after each mutation invalidate and reload status/branch. Preserve rootPath
  identity across workspace changes.
- [ ] Render accessible group headings, counts, path/filename, status code, stage/
  unstage actions, commit input/button, refresh, current branch, local branch list,
  and diff affordance. Use a co-located CSS Module with shared `--tn-*` tokens;
  no Tailwind utility classes, inline styles, or retired CSS.
- [ ] Preserve panel state while hidden (`keepMounted`), but reset workspace-scoped
  message/selection when `rootPath` changes. Provide keyboard/focus and `aria-live`
  behavior for loading, success, and errors.
- [ ] If Git is unavailable or mobile cannot spawn Git, make that capability state
  explicit; never render enabled actions that cannot work.

## Likely files and boundaries

- UI/shell: `apps/desktop/src/git/SourceControlPanel.tsx`,
  `SourceControlPanel.test.tsx`, `sourceControlRequestGate.ts`,
  `apps/desktop/src/panels/panelRegistry.tsx`, `panelRegistry.test.tsx`,
  `panels/LeftPopout.tsx`, `shell/ActivityBar.tsx`, and `shell/DesktopShell.tsx`
  only where callbacks/context are required.
- Frontend bridge/adapter: `apps/desktop/src/native/commands.ts`,
  `apps/desktop/src/git/gitService.ts`, and `gitService.test.ts`; all Rust calls
  stay behind `native/`.
- Rust/native command owner: `apps/desktop/src-tauri/src/commands/git.rs`,
  `commands/mod.rs`, `src/tests.rs`; command map additions must be typed and
  snake_case-compatible. `src-tauri/src/lib.rs` is not the registration list.

## Tests and manual repository setup

- React/Vitest tests cover every state, action disabled/enabled rules, keyboard
  flow, accessibility announcements, root switch race, branch/diff loading, and
  error details. Registry tests assert source-control remains in left order.
- Rust tests belong in `src/tests.rs` with `MockGitRunner` plus temp repositories;
  adapter tests assert every command name/args/result mapping. Run `pnpm lint`,
  `pnpm typecheck`, `pnpm exec vitest run apps/desktop/src/git
  apps/desktop/src/panels`, and `cargo test`.
- Manual repository: create a temp folder; `git init`; configure local identity;
  add `one.md`, commit; modify it, create `new.md`, delete another, and rename a
  file. Open it in the app, select Source control, stage/unstage each group, commit,
  refresh, switch workspace to a non-repo, and return. Verify stale requests cannot
  replace the current workspace state.

## Automated validation

Run React/registry/adapter tests plus Rust command tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `cargo test`.

## Manual desktop/mobile checks

Desktop: run the approved panel states and repository matrix on Windows/Linux/macOS, including races and dirty editor behavior. Mobile: verify responsive read-only/unavailable state, touch/keyboard/accessibility, and no process-spawn assumption.

## Handoff expectations

Deliver approved iterative desktop/mobile mockups, state/copy/accessibility matrix, integration test report, and unresolved product questions; concrete file paths remain likely until implementation confirms them.

## Platform, non-goals, and dependency order

- Windows: test `git.exe`, CRLF, spaces/non-ASCII paths, high-DPI and 760px layout.
  Linux: test missing Git/PATH and executable hooks. macOS: test Homebrew/Xcode Git
  and dark/light tokens. Mobile: same React surface but gate process-spawn/native
  Git and keep a clear unavailable state; do not assume desktop filesystem paths.
- Non-goals: push/pull, remote auth, branch switching, automatic sync, file watchers,
  background sync execution, conflict-resolution editor, or provider integrations.
- Order: current registry shell → typed error contract → commit and branch adapters
  → panel completion → inline diff viewer. Extension-host registration is a
  separate seam and must not make basic Source Control depend on sync.
