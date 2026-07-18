# Review — 2026-07-18

## Scope

Staged changes on `new-ui` branch (17 files, +583/-49) implementing the Workspace Explorer selector and multi-window workspace sessions:

- **Backend (Rust/Tauri):** `apps/desktop/src-tauri/src/lib.rs`, `capabilities/default.json`, `src/native/commands.ts`
- **Frontend (React/TS):** `WorkspaceExplorer.tsx/.test.tsx`, `WorkspaceFileIcon.tsx`, `WorkspaceExplorer.module.css`, `DesktopShell.tsx`, `desktopState.ts/.test.ts`, `workspaceAdapter.ts`
- **Docs/Config/E2E:** `e2e/app.spec.ts`, `package.json`, `pnpm-lock.yaml`, 3 plan docs

Reviewed via 4 parallel subagents (read-only: `read`, `grep`, `git diff`). No build/test runs.

## Findings

**16 findings** total. 2 high-urgency, 6 medium, 8 low.

### High urgency

| Finding | File | Difficulty |
|---|---|---|
| [onWorkspaceLaunched clobbers shared lastWorkspacePath](onWorkspaceLaunched-clobbers-shared-lastWorkspacePath,medium,high.md) | `src/shell/DesktopShell.tsx` | medium |
| [WorkspaceSelector menu keyboard nav / focus management](workspace-selector-menu-keyboard-nav-focus-management,medium,high.md) | `src/workspace/WorkspaceExplorer.tsx` | medium |

### Medium urgency

| Finding | File | Difficulty |
|---|---|---|
| [Workspace window root registered before build](workspace-window-root-registered-before-build,medium,medium.md) | `src-tauri/src/lib.rs` | medium |
| [openWorkspace rewrite leaves dead picking/cancelled phases](openworkspace-rewrite-leaves-dead-picking-cancelled-phases,medium,medium.md) | `src/shell/DesktopShell.tsx` | medium |
| [recentWorkspacePaths not synced across windows](recentWorkspacePaths-not-synced-across-windows,medium,medium.md) | `src/settings/desktopState.ts` | medium |
| [Restore effect drops desktopState on windowRoot rejection](restore-effect-drops-desktopState-on-windowRoot-rejection,easy,medium.md) | `src/shell/DesktopShell.tsx` | easy |
| [Inline onWorkspaceLaunched defeats WorkspaceExplorer memo](inline-onWorkspaceLaunched-defeats-WorkspaceExplorer-memo,easy,medium.md) | `src/shell/DesktopShell.tsx` | easy |
| [Stale e2e test title](stale-e2e-test-title,easy,medium.md) | `e2e/app.spec.ts` | easy |

### Low urgency

| Finding | File | Difficulty |
|---|---|---|
| [Workspace window cleanup paths untested](workspace-window-cleanup-paths-untested,easy,low.md) | `src-tauri/src/lib.rs` | easy |
| [WorkspaceSelector onSelect duplicates openWorkspace logic](workspace-selector-onselect-duplicates-openworkspace-logic,easy,low.md) | `src/workspace/WorkspaceExplorer.tsx` | easy |
| [Weak vacuous e2e assertion](weak-vacuous-assertion,easy,low.md) | `e2e/app.spec.ts` | easy |
| [CSS module additions cram rules onto single lines](css-module-additions-cram-rules-onto-single-lines,trivial,low.md) | `WorkspaceExplorer.module.css` | trivial |
| [InlineNameInput still uses string glyphs vs Lucide icons](inline-name-input-still-uses-string-glyphs-vs-lucide-icons,trivial,low.md) | `src/workspace/WorkspaceExplorer.tsx` | trivial |
| [MRU promotion duplicated with hardcoded 12](mru-promotion-duplicated-with-hardcoded-12,trivial,low.md) | `src/shell/DesktopShell.tsx` | trivial |
| [Unsupported version test now tests field coercion](unsupported-version-test-now-tests-field-coercion,trivial,low.md) | `src/settings/desktopState.test.ts` | trivial |
| [Inconsistent plan crossref](inconsistent-plan-crossref,trivial,low.md) | `plans/wip-workspace-explorer-med-med.md` | trivial |

## Cross-cutting theme

`lastWorkspacePath` is shared global state, but workspace roots are now per-window. Both `onWorkspaceLaunched` (targets a *new* window) and `handleWorkspaceOpened` (targets the *current* window) persist `lastWorkspacePath` identically, conflating "workspace I'm viewing" with "workspace I just launched elsewhere." The two high-urgency findings and several medium ones stem from this conflation plus the multi-window lifecycle gaps in the Rust backend.
