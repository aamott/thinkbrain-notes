# Explorer Icons and Workspace Selector

## Goal

Make the fresh Explorer resemble the desktop reference: compact, themed file
and folder icons, right-click-first file actions, and a bottom workspace
selector that opens each selected workspace in its own desktop window.

## Acceptance Criteria

- [x] Tree rows use a tree-shakeable icon library for folders and common file
      types; icon color inherits the active semantic theme.
- [x] The Explorer header has no visible New Note or Open Workspace action.
      Right-click menus remain the creation and refresh entry point.
- [x] A div-based workspace selector sits at the bottom of the Explorer.
      Its accessible dropdown lists known workspaces with icons and has a final
      **Add workspace** action.
- [x] Selecting or adding a workspace opens a new Tauri window for that root;
      it does not replace the workspace in the originating window.
- [x] Each new window receives its workspace through a typed native boundary,
      never a filesystem path embedded in the frontend URL.
- [x] The most recently opened workspace persists in app settings and restores
      when a normal app window opens again.
- [x] Context-menu, selector, native-window, state migration, and icon mapping
      have focused tests.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, Rust tests and
      clippy, plus the regular desktop launch pass.

## Architecture

- Use `lucide-react` individual imports. Decorative SVGs use `currentColor`
  through CSS classes and retain Lucide's default `aria-hidden` behavior.
- Keep right-click CRUD in `WorkspaceExplorer`; remove only the redundant
  header action. The selector is a reusable explorer-local component rendered
  as a div/button/menu structure so it can later gain workspace context.
- Extend desktop state with an ordered recent-workspace list, preserving the
  existing `lastWorkspacePath` schema as the migration source.
- The Rust host validates a requested root, opens a uniquely-labelled window,
  and stores its canonical root in managed native state keyed by window label.
  The renderer asks its typed adapter for that root on startup; it does not
  accept unvalidated query-string filesystem paths.

## Files

- `apps/desktop/src/workspace/WorkspaceExplorer.tsx`
- `apps/desktop/src/workspace/WorkspaceExplorer.module.css`
- `apps/desktop/src/workspace/workspaceAdapter.ts`
- `apps/desktop/src/settings/desktopState.ts`
- `apps/desktop/src/shell/DesktopShell.tsx`
- `apps/desktop/src/native/commands.ts`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/capabilities/default.json`
- `apps/desktop/package.json`

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (59 tests), `pnpm build`
- `pnpm --filter @thinkbrain/desktop test:e2e` (12 Chromium tests)
- `cargo test` (40 tests), `cargo clippy -- -D warnings`
- `pnpm desktop:run` launched the native desktop shell
