# Inline Diff Viewer

> **REPLAN NEEDED:** Git sync should replace built-in Git entirely, not layer on
> top. See `plans/wip-git-integration-low-hard.md` before implementing.

## Goal

Let users inspect a changed workspace file from Source Control in a VS Code-style
unified or side-by-side inline view, using system Git output. This is read-only
MVP review; it is not a merge/conflict editor.

## Discovery questions — answer before UI work

- Unified or side-by-side by default, and is there a user setting/toggle? Define
  behavior at narrow/mobile widths.
- Does selecting a file open a new tab, reuse an existing diff tab, or render below
  the file row? Define close/reload behavior when status changes.
- For untracked files, compare an empty blob to the working file or show a clear
  "untracked" summary? For binary files, show metadata rather than bytes?
- How should renamed/copied/deleted files and very large diffs be capped and
  announced to assistive technology?

**STOP gate:** No diff mockups, CodeMirror integration, JSX, CSS, or screenshots
until these questions are answered. In particular, do not accidentally design a
conflict-resolution UI under this story.

## Implementation-ready acceptance criteria

- [ ] Add a serializable `GitDiff` Rust result (path, base/working labels, hunks or
  bounded unified text, binary/truncated flags) and `git_diff(root_path: String,
  path: String, staged: bool) -> Result<GitDiff, NativeError>` in
  `apps/desktop/src-tauri/src/commands/git.rs`. Use fixed `git diff --no-ext-diff
  --no-color --unified=3 [--cached] -- -- <validated path>`; choose and document
  the exact argument form and support untracked/deleted paths without shell
  interpolation.
- [ ] Register `git_diff` in `apps/desktop/src-tauri/src/commands/mod.rs`; add
  `git_diff` to `NativeCommandMap` in `apps/desktop/src/native/commands.ts` with
  typed `{ rootPath: string; path: string; staged: boolean }` args and snake_case
  response fields. Keep output bounded to avoid freezing the webview.
- [ ] Extend `GitCommandName`, `GitDesktopApi.getDiff`, and `GitService.getDiff`
  in `apps/desktop/src/git/gitService.ts`; cache only while the selected status
  revision is unchanged, and invalidate on status mutations. Preserve typed error
  code/details.
- [ ] Implement the approved rendering in the existing editor/tab surface (likely
  `apps/desktop/src/tabs/MarkdownEditor.tsx`, `tabModel.ts`, and a new
  `apps/desktop/src/git/GitDiffView.tsx` plus co-located module CSS if needed),
  or document a panel-only choice. Source Control owns selection/loading/error;
  no native calls leave `apps/desktop/src/native/`.
- [ ] Add accessible hunk/file labels, focus management, truncation/binary copy,
  and a refresh/close action. A diff must never be editable or writable.

## Likely files and boundaries

Rust: `apps/desktop/src-tauri/src/commands/git.rs`, `commands/mod.rs`,
`src/tests.rs`. Native map: `apps/desktop/src/native/commands.ts` and
`commands.test.ts`. Adapter: `apps/desktop/src/git/gitService.ts` and
`gitService.test.ts`. UI integration: `SourceControlPanel.tsx`,
`SourceControlPanel.test.tsx`, and the existing tab/editor files only after the
STOP-gate decision. Do not add a second shell or restore retired stores.

## Tests and manual repository setup

- Rust mock tests assert exact args, staged versus working diff, path validation,
  untracked/deleted/binary handling, malformed UTF-8 policy, output truncation,
  timeout, and typed failures. Temp repo: commit `base.md`; modify it, stage a
  second change, create an untracked text and binary file, delete/rename another;
  assert both staged and unstaged diff views.
- Vitest tests cover command mapping, cache invalidation, hunk parsing/rendering,
  loading/error/binary/truncated states, keyboard/focus behavior, and narrow layout
  fallback. Manual setup can use the Source Control repository from the panel story;
  inspect each status group, mutate the file while the diff is open, and verify
  refresh never overwrites the file.

## Automated validation

Run Rust diff command, parser/viewer, adapter, and accessibility tests, `pnpm lint`, `pnpm typecheck`, and `cargo test`.

## Manual desktop/mobile checks

Desktop: inspect staged/unstaged/untracked/deleted/binary/truncated diffs on Windows/Linux/macOS without edits. Mobile: show approved unavailable/read-only state without desktop-Git assumptions.

## Handoff expectations

Deliver approved iterative desktop/mobile mockups, diff DTO/parser contract, bounds/accessibility report, test matrix, and unresolved UX questions; concrete file paths remain likely until implementation confirms them.

## Platform, non-goals, and dependency order

- Windows: normalize display-only separators and test CRLF without changing Git
  output; Linux/macOS: test executable/binary files and large diffs. Mobile: if
  Git/process spawn is unavailable, show a typed unavailable state; do not assume a
  desktop `.git` path or render an enabled action.
- Non-goals: editing, applying/reverting hunks, staging from the diff, merge markers,
  three-way conflict resolution, push/pull, hosting providers, watchers, or sync.
- Order: typed error contract → status/stage/unstage → diff native command and
  adapter → approved UI discovery/STOP gate → viewer integration. Conflict
  resolution remains a later separate story.
