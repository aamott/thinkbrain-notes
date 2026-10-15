import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NativeWorkspaceEntry } from "../native/commands";
import { buildWorkspaceTree, workspaceErrorMessage } from "./workspaceExplorerModel";
import { workspaceDesktopApi, type WorkspaceDesktopApi } from "./workspaceAdapter";
import { subscribeExplorerToNoteChanges } from "./workspaceExplorerRefresh";
import { writeWorkspaceSettings } from "./workspaceSettings";
import type { ExplorerSortOrder } from "./explorerSort";
import { WorkspaceExplorerView } from "./WorkspaceExplorerView";
import { useWorkspaceSessionContext } from "./workspaceSession";
export { WorkspaceSelector } from "./WorkspaceSelector";
import { useWorkspaceSwitchingContext } from "./workspaceSwitchingContext";
import { useWorkspaceContextMenu } from "./useWorkspaceContextMenu";
import { useWorkspaceInlineCreate } from "./useWorkspaceInlineCreate";
import { useWorkspaceTreeNavigation } from "./useWorkspaceTreeNavigation";
import {
  isInvalidWorkspaceMove,
  remapExpandedFolders,
  remapMovedPath,
  WORKSPACE_INVALID_MOVE_MESSAGE,
  workspaceMoveDestination
} from "./workspaceMove";
import { joinPath, isValidName, type RenameState, type WorkspaceExplorerActions } from "./workspaceExplorerTypes";

export interface WorkspaceExplorerProps {
  readonly api?: WorkspaceDesktopApi;
  readonly className?: string;
  readonly onMarkdownFileSelected?: (rootPath: string, relativePath: string) => void;
  /** Fired when any file (Markdown or not) is selected. Falls back to onMarkdownFileSelected. */
  readonly onFileSelected?: (rootPath: string, relativePath: string) => void;
  /** Fired when a new Markdown file is created so the shell can open it. */
  readonly onMarkdownFileCreated?: (rootPath: string, relativePath: string) => void;
  /** Request that the explorer begin creating a note at the workspace root. */
  readonly newNoteFocusRequest?: number;
  readonly onNewNoteFocusHandled?: () => void;
  /** Asked for one file's earlier versions from the right-click menu. */
  readonly onShowVersions?: (rootPath: string, relativePath: string) => void;
  /**
   * Set when the shell places the workspace selector in panel headers: the
   * explorer renders the selector inside its own chrome row.
   */
  readonly workspaceSelectorInPanel?: boolean;
}

/**
 * Workspace explorer with folder-open, file/folder CRUD, and a right-click
 * context menu. All filesystem operations stay in the supplied desktop adapter.
 *
 * A consumer of the shell's workspace session, not its loader: which root is
 * open, its entries and its per-workspace view settings all come from the
 * session. Only explorer-local UI — expansion, selection, CRUD transients —
 * lives here.
 */
export const WorkspaceExplorer = memo(function WorkspaceExplorer({
  api = workspaceDesktopApi,
  className,
  onMarkdownFileSelected,
  onFileSelected,
  onMarkdownFileCreated,
  newNoteFocusRequest = 0,
  onNewNoteFocusHandled,
  onShowVersions,
  workspaceSelectorInPanel = false
}: WorkspaceExplorerProps) {
  const session = useWorkspaceSessionContext();
  const state = session;
  const { showHidden, explorerSort } = session;
  const { contextMenu, setContextMenu, showContextMenu, showContextMenuAt, closeContextMenu } = useWorkspaceContextMenu();
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<NativeWorkspaceEntry | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Open state for the header "..." (more actions) dropdown popover.
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const tree = useMemo(() => buildWorkspaceTree(state.entries, explorerSort), [state.entries, explorerSort]);
  const workspaceRootPath = state.snapshot?.workspace.root_path;
  const {
    expandedFolders,
    setExpandedFolders,
    activePath,
    setActivePath,
    expandFolder,
    toggleFolder,
    collapseFolder,
    handleTreeKeyDown
  } = useWorkspaceTreeNavigation(tree);

  // Refs holding the latest state/props so async helpers never read stale
  // closures after an `await`. The workspace root captured before an operation
  // is compared to the session's current one after each `await`; if it changed
  // (workspace switched/closed), the in-flight refresh is aborted.
  const stateRef = useRef(state);
  const rootPathRef = session.rootRef;
  const apiRef = useRef(api);
  const sessionRef = useRef(session);
  const callbacksRef = useRef({ onMarkdownFileCreated, onMarkdownFileSelected, onFileSelected });
  // Refs are updated in an effect (not during render) per the react-hooks/refs
  // rule. Async helpers read `*.current` after each `await`.
  useEffect(() => {
    stateRef.current = state;
    apiRef.current = api;
    sessionRef.current = session;
    callbacksRef.current = { onMarkdownFileCreated, onMarkdownFileSelected, onFileSelected };
  });

  // In-flight operation counter so overlapping CRUD calls do not clobber the
  // `busy` flag or erase each other's errors prematurely.
  const inFlightRef = useRef(0);
  const startOperation = useCallback(() => {
    inFlightRef.current += 1;
    setBusy(true);
  }, []);
  const endOperation = useCallback(() => {
    inFlightRef.current = Math.max(0, inFlightRef.current - 1);
    if (inFlightRef.current === 0) setBusy(false);
  }, []);

  // ---- CRUD operations ----

  /**
   * Runs a CRUD operation, refreshes the entry list, and reports success.
   * Reads the latest state from refs so a workspace switch mid-operation
   * aborts the refresh instead of dispatching stale data. Returns `true` on
   * success so callers (delete dialog, inline inputs) can close only on
   * success and keep the user's input visible on failure.
   */
  const runWithRefresh = useCallback(async (operation: () => Promise<unknown>, options?: { selectMarkdown?: string }): Promise<boolean> => {
    const rootPath = rootPathRef.current;
    const snapshot = stateRef.current.snapshot;
    if (!rootPath || !snapshot) return false;
    startOperation();
    // Only clear a previous error when no other operation is in flight, so a
    // concurrent failure is not erased before the user reads it.
    if (inFlightRef.current === 1) setActionError(null);
    try {
      await operation();
      if (rootPathRef.current !== rootPath) return true;
      if (!(await sessionRef.current.refreshEntries(rootPath))) return true;
      if (options?.selectMarkdown) {
        callbacksRef.current.onMarkdownFileCreated?.(rootPath, options.selectMarkdown);
        callbacksRef.current.onFileSelected?.(rootPath, options.selectMarkdown);
      }
      return true;
    } catch (error) {
      if (rootPathRef.current === rootPath) setActionError(workspaceErrorMessage(error));
      return false;
    } finally {
      endOperation();
    }
  }, [endOperation, rootPathRef, startOperation]);

  const {
    creating,
    pendingExtensionConfirm,
    inlineCreateError,
    extensionConfirmError,
    setInlineCreateError,
    resetCreate,
    focusNewNote,
    submitCreate,
    dismissExtensionConfirm,
    confirmExtensionCreate,
    startCreate,
    setCreatingGuarded
  } = useWorkspaceInlineCreate({ stateRef, rootPathRef, apiRef, runWithRefresh, setActionError, closeContextMenu, expandFolder });

  const clearWorkspaceState = useCallback(() => {
    setContextMenu(null);
    setRenaming(null);
    resetCreate();
    setPendingDelete(null);
    setActionError(null);
    setExpandedFolders(new Set());
  }, [resetCreate, setContextMenu, setExpandedFolders]);

  // Invalidate operations and transient UI associated with the previous
  // workspace once the session moves to another root. In particular, this
  // keeps a pending delete from being applied to a same-named entry in the
  // new root.
  const seenRootRef = useRef(session.rootPath);
  useEffect(() => {
    if (seenRootRef.current === session.rootPath) return;
    seenRootRef.current = session.rootPath;
    clearWorkspaceState();
  }, [session.rootPath, clearWorkspaceState]);

  const refreshEntries = useCallback(async () => {
    const rootPath = rootPathRef.current;
    const snapshot = stateRef.current.snapshot;
    if (!rootPath || !snapshot) return;
    try {
      // The session drops a listing that lands after the workspace changed.
      await sessionRef.current.refreshEntries(rootPath);
    } catch (error) {
      setActionError(workspaceErrorMessage(error));
    }
  }, [rootPathRef]);

  // The switching controller lives at shell level: the selector in the
  // explorer's chrome, the open-workspace menu item and the empty state's
  // actions all read the same instance through context.
  const switching = useWorkspaceSwitchingContext();

  /**
   * Toggles the "show hidden entries" preference, persists it to the current
   * workspace's settings, and re-lists entries so the tree updates without
   * reopening the workspace. Persistence failures are surfaced as action
   * errors but do not revert the in-memory toggle: the user can still see the
   * effect for this session and retry the toggle to write again.
   */
  const toggleShowHidden = useCallback(async () => {
    const rootPath = rootPathRef.current;
    const next = !sessionRef.current.showHidden;
    sessionRef.current.setShowHidden(next);
    if (rootPath) {
      try {
        await writeWorkspaceSettings(rootPath, { showHidden: next });
      } catch (error) {
        setActionError(workspaceErrorMessage(error));
      }
    }
    await refreshEntries();
  }, [refreshEntries, rootPathRef]);

  /**
   * Applies a new tree ordering and persists it for the current workspace.
   * Ordering is a pure reorder of already-loaded entries, so no refresh is
   * needed — only the write can fail, and that surfaces as an action error
   * without reverting the visible order.
   */
  const applyExplorerSort = useCallback(async (order: ExplorerSortOrder): Promise<void> => {
    sessionRef.current.setExplorerSort(order);
    const rootPath = rootPathRef.current;
    if (!rootPath) return;
    try {
      await writeWorkspaceSettings(rootPath, { explorerSort: order });
    } catch (error) {
      setActionError(workspaceErrorMessage(error));
    }
  }, [rootPathRef]);

  // Follow the folder, not just this window's own edits. A `git pull`, a sync
  // client or another editor changes what the workspace holds without the
  // explorer having done anything, and the tree would keep showing the old
  // listing until it was refreshed by hand. `refreshEntries` is the same path
  // every in-app create, rename and delete already takes, so entries no note
  // event can name — folders, images, canvases — come back correct too.
  useEffect(
    () =>
      subscribeExplorerToNoteChanges(
        () => rootPathRef.current,
        () => void refreshEntries()
      ),
    [refreshEntries, rootPathRef]
  );

  // Command palette "New note" focuses a create-file input at the workspace
  // root. Handled in an effect with a pending-request ref so a request that
  // arrives before `state.phase === "ready"` is not silently dropped.
  const pendingNewNoteRef = useRef(0);
  useEffect(() => {
    if (newNoteFocusRequest) pendingNewNoteRef.current = newNoteFocusRequest;
  }, [newNoteFocusRequest]);
  useEffect(() => {
    const request = pendingNewNoteRef.current;
    if (!request || state.phase !== "ready") return;
    pendingNewNoteRef.current = 0;
    focusNewNote();
    onNewNoteFocusHandled?.();
  }, [state.phase, focusNewNote, onNewNoteFocusHandled, newNoteFocusRequest]);

  const handleFileSelected = useCallback((relativePath: string) => {
    if (!workspaceRootPath) return;
    // Prefer the general file handler (which infers tab kind); fall back to
    // the Markdown-only handler for callers that haven't been updated yet.
    if (onFileSelected) onFileSelected(workspaceRootPath, relativePath);
    else onMarkdownFileSelected?.(workspaceRootPath, relativePath);
  }, [onFileSelected, onMarkdownFileSelected, workspaceRootPath]);

  const submitRename = useCallback(async (target: RenameState, newName: string): Promise<boolean> => {
    const rootPath = stateRef.current.snapshot?.workspace.root_path;
    if (!rootPath) return false;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === target.entry.name) {
      setRenaming(null);
      return true;
    }
    if (!isValidName(trimmed)) {
      setActionError("Names cannot contain path separators (/ or \\).");
      return false;
    }
    const newRelativePath = joinPath(target.entry.parent_path, trimmed);
    const ok = await runWithRefresh(async () => {
      await apiRef.current.renameWorkspaceEntry(rootPath, target.entry.relative_path, newRelativePath);
    });
    if (ok) setRenaming(null);
    return ok;
  }, [runWithRefresh]);

  /**
   * Moves an entry into another folder ("" = root) via the rename path, then
   * re-points the lifted tree state — active row and expanded folders — so a
   * moved folder keeps its expansion and the moved row stays the active one.
   * A drop back on the current parent is a no-op that resolves true; a folder
   * dropped into itself or a descendant is rejected before any native call.
   */
  const moveEntry = useCallback(async (source: NativeWorkspaceEntry, parentPath: string): Promise<boolean> => {
    const rootPath = stateRef.current.snapshot?.workspace.root_path;
    if (!rootPath) return false;
    if (isInvalidWorkspaceMove(source, parentPath)) {
      if (parentPath === source.parent_path) return true;
      setActionError(WORKSPACE_INVALID_MOVE_MESSAGE);
      return false;
    }
    const destination = workspaceMoveDestination(source, parentPath);
    const ok = await runWithRefresh(async () => {
      await apiRef.current.renameWorkspaceEntry(rootPath, source.relative_path, destination);
    });
    // A move that completed against a workspace the user has since left must
    // not remap the current workspace's selection or expansion.
    if (ok && rootPathRef.current === rootPath) {
      setActivePath((current) =>
        remapMovedPath(current ?? source.relative_path, source.relative_path, destination)
      );
      setExpandedFolders((current) =>
        remapExpandedFolders(current, source.relative_path, destination)
      );
    }
    return ok;
  }, [rootPathRef, runWithRefresh, setActivePath, setExpandedFolders]);

  const confirmDelete = useCallback(async () => {
    const rootPath = stateRef.current.snapshot?.workspace.root_path;
    if (!rootPath || !pendingDelete) return;
    const entry = pendingDelete;
    const ok = await runWithRefresh(async () => {
      await apiRef.current.deleteWorkspaceEntry(rootPath, entry.relative_path);
    });
    // Keep the confirmation dialog open on failure so the user can retry.
    if (ok) setPendingDelete(null);
  }, [pendingDelete, runWithRefresh]);

  const startRename = useCallback((entry: NativeWorkspaceEntry) => {
    closeContextMenu();
    setRenaming({ entry, focusRequest: Date.now() });
  }, [closeContextMenu]);

  const showVersions = useCallback((entry: NativeWorkspaceEntry) => {
    closeContextMenu();
    const root = rootPathRef.current;
    if (root) onShowVersions?.(root, entry.relative_path);
  }, [closeContextMenu, onShowVersions, rootPathRef]);

  const requestDelete = useCallback((entry: NativeWorkspaceEntry) => {
    closeContextMenu();
    setPendingDelete(entry);
  }, [closeContextMenu]);

  const dismissError = session.dismissError;

  // Memoized, and every member is already a stable callback or state setter.
  // That is load-bearing rather than tidy: `WorkspaceTreeItem` is memoized, and
  // a fresh object here would re-render every row in the tree on every
  // keystroke in an inline rename.
  const actions = useMemo<WorkspaceExplorerActions>(
    () => ({
      setActivePath,
      toggleShowHidden,
      setExplorerSort: applyExplorerSort,
      startCreate,
      submitCreate,
      submitRename,
      handleTreeKeyDown,
      handleFileSelected,
      showContextMenu,
      showContextMenuAt,
      closeContextMenu,
      toggleFolder,
      collapseFolder,
      expandFolder,
      moveEntry,
      startRename,
      requestDelete,
      showVersions,
      refreshEntries,
      openWorkspace: switching.openWorkspace,
      confirmDelete,
      setInlineCreateError,
      dismissExtensionConfirm,
      confirmExtensionCreate,
      setMoreMenuOpen,
      setRenaming,
      setCreating: setCreatingGuarded,
      setPendingDelete,
      dismissError
    }),
    [
      closeContextMenu,
      collapseFolder,
      expandFolder,
      moveEntry,
      applyExplorerSort,
      confirmDelete,
      confirmExtensionCreate,
      dismissError,
      dismissExtensionConfirm,
      handleFileSelected,
      handleTreeKeyDown,
      refreshEntries,
      requestDelete,
      setActivePath,
      setCreatingGuarded,
      setInlineCreateError,
      showContextMenu,
      showContextMenuAt,
      showVersions,
      startCreate,
      startRename,
      submitCreate,
      submitRename,
      switching.openWorkspace,
      toggleFolder,
      toggleShowHidden
    ]
  );

  return (
    <WorkspaceExplorerView
      className={className}
      state={state}
      tree={tree}
      workspaceRootPath={workspaceRootPath}
      contextMenu={contextMenu}
      renaming={renaming}
      creating={creating}
      pendingDelete={pendingDelete}
      pendingExtensionConfirm={pendingExtensionConfirm}
      inlineCreateError={inlineCreateError}
      extensionConfirmError={extensionConfirmError}
      actionError={actionError}
      busy={busy}
      showHidden={showHidden}
      explorerSort={explorerSort}
      moreMenuOpen={moreMenuOpen}
      expandedFolders={expandedFolders}
      activePath={activePath}
      actions={actions}
      switching={switching}
      workspaceSelectorInPanel={workspaceSelectorInPanel}
    />
  );
});
