# Multi-Window Workspace Sessions

## Goal

Open each selected workspace in its own Tauri window while retaining a
validated, app-data-only record of the most recently used workspace roots.

## Acceptance Criteria

- [x] A typed native command validates a selected workspace root and creates a
      uniquely labelled desktop window for it.
- [x] The host keeps each dynamic window's canonical root in managed state;
      the renderer retrieves it through a typed command instead of a URL path.
- [x] Dynamic workspace windows receive the minimal core/dialog capabilities
      needed to invoke commands and show the directory picker.
- [x] Desktop state migrates from the single saved root to a bounded MRU list
      while preserving `lastWorkspacePath` for normal startup restoration.
- [x] Selecting a known workspace or choosing **Add workspace** opens a new
      window and promotes that root in the MRU list without replacing the
      source window's Explorer.
- [x] Native state and desktop-state migration have unit coverage; regular
      desktop launch verifies the Tauri capability configuration.

## Decisions

- Duplicate windows are allowed: every successful selector/add action creates
  a new workspace window, matching the requested “opening opens a new window”
  behavior. The host uses opaque sequence labels, never filesystem paths.
- Recent roots are app settings only and bounded to 12 entries. A missing root
  clears `lastWorkspacePath` but is retained only until a later valid workspace
  promotion rewrites the MRU list.
- This story depends on the Explorer selector story; that selector owns the
  user interaction, while this story owns only window/session transport and
  persistence.

## Files

- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/capabilities/default.json`
- `apps/desktop/src/native/commands.ts`
- `apps/desktop/src/workspace/workspaceAdapter.ts`
- `apps/desktop/src/settings/desktopState.ts`
- `apps/desktop/src/shell/DesktopShell.tsx`

## Verification

- Desktop-state tests cover v0/v1 migration, MRU promotion, deduplication,
  the 12-workspace bound, and clearing the current root.
- Rust tests cover opaque labels and root registration/lookup/cleanup.
- The complete lint, JS/Rust tests, clippy, production build, browser harness,
  and native desktop launch passed.
