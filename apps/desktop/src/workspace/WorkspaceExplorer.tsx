import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import type { NativeWorkspaceEntry, NativeWorkspaceSnapshot } from "../native/commands";
import {
  buildWorkspaceTree,
  initialWorkspaceExplorerState,
  workspaceErrorMessage,
  workspaceExplorerReducer
} from "./workspaceExplorerModel";
import { workspaceDesktopApi, type WorkspaceDesktopApi } from "./workspaceAdapter";
import { subscribeExplorerToNoteChanges } from "./workspaceExplorerRefresh";
import { DEFAULT_WORKSPACE_SETTINGS, readWorkspaceSettings, writeWorkspaceSettings } from "./workspaceSettings";
import { WorkspaceExplorerView } from "./WorkspaceExplorerView";
export { WorkspaceSelector } from "./WorkspaceExplorerView";
import {
  joinPath,
  isMarkdownName,
  isValidFolderPath,
  isValidName,
  visibleWorkspacePaths,
  type ContextMenuState,
  type ContextMenuTarget,
  type CreateState,
  type RenameState
} from "./workspaceExplorerTypes";

export interface WorkspaceExplorerProps {
  readonly api?: WorkspaceDesktopApi;
  readonly className?: string;
  readonly initialWorkspacePath?: string | null;
  readonly onWorkspaceOpened?: (rootPath: string, snapshot: NativeWorkspaceSnapshot) => void;
  readonly onWorkspaceUnavailable?: (rootPath: string) => void;
  readonly onMarkdownFileSelected?: (rootPath: string, relativePath: string) => void;
  /** Fired when a new Markdown file is created so the shell can open it. */
  readonly onMarkdownFileCreated?: (rootPath: string, relativePath: string) => void;
  /** Request that the explorer begin creating a note at the workspace root. */
  readonly newNoteFocusRequest?: number;
  readonly onNewNoteFocusHandled?: () => void;
  readonly recentWorkspacePaths?: readonly string[];
  readonly onWorkspaceLaunched?: (rootPath: string) => void;
  /** Asked for one file's earlier versions from the right-click menu. */
  readonly onShowVersions?: (rootPath: string, relativePath: string) => void;
}

/**
 * Workspace explorer with folder-open, file/folder CRUD, and a right-click
 * context menu. All filesystem operations stay in the supplied desktop adapter.
 */
export const WorkspaceExplorer = memo(function WorkspaceExplorer({
  api = workspaceDesktopApi,
  className,
  initialWorkspacePath = null,
  onWorkspaceOpened,
  onWorkspaceUnavailable,
  onMarkdownFileSelected,
  onMarkdownFileCreated,
  newNoteFocusRequest = 0,
  onNewNoteFocusHandled,
  recentWorkspacePaths = [],
  onWorkspaceLaunched,
  onShowVersions
}: WorkspaceExplorerProps) {
  const [state, dispatch] = useReducer(workspaceExplorerReducer, initialWorkspaceExplorerState);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const [creating, setCreating] = useState<CreateState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<NativeWorkspaceEntry | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<ReadonlySet<string>>(new Set());
  // Whether dot-prefixed entries (`.git`, `.obsidian`, …) are listed in the
  // tree. Persisted per-workspace via `readWorkspaceSettings`/`writeWorkspaceSettings`
  // and restored when a workspace opens.
  const [showHidden, setShowHidden] = useState<boolean>(DEFAULT_WORKSPACE_SETTINGS.showHidden);
  // Open state for the header "..." (more actions) dropdown popover.
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const tree = useMemo(() => buildWorkspaceTree(state.entries), [state.entries]);
  const workspaceRootPath = state.snapshot?.workspace.root_path;

  // Refs holding the latest state/props so async helpers never read stale
  // closures after an `await`. The workspace root captured before an operation
  // is compared to the current one after each `await`; if it changed (workspace
  // switched/closed), the in-flight refresh is aborted.
  const stateRef = useRef(state);
  const rootPathRef = useRef(workspaceRootPath);
  const apiRef = useRef(api);
  const showHiddenRef = useRef(showHidden);
  const callbacksRef = useRef({ onMarkdownFileCreated, onMarkdownFileSelected, onWorkspaceLaunched });
  // Refs are updated in an effect (not during render) per the react-hooks/refs
  // rule. Async helpers read `*.current` after each `await`.
  useEffect(() => {
    stateRef.current = state;
    apiRef.current = api;
    showHiddenRef.current = showHidden;
    callbacksRef.current = { onMarkdownFileCreated, onMarkdownFileSelected, onWorkspaceLaunched };
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

  const clearWorkspaceState = useCallback(() => {
    setContextMenu(null);
    setRenaming(null);
    setCreating(null);
    setPendingDelete(null);
    setActionError(null);
    setExpandedFolders(new Set());
    setShowHidden(DEFAULT_WORKSPACE_SETTINGS.showHidden);
  }, []);

  const loadWorkspace = useCallback(async (rootPath: string, restoring = false) => {
    // Invalidate operations and transient UI associated with the previous
    // workspace before the new one begins loading. In particular, this keeps
    // a pending delete from being applied to a same-named entry in the new root.
    const isWorkspaceSwitch = rootPathRef.current !== rootPath;
    rootPathRef.current = rootPath;
    if (isWorkspaceSwitch) clearWorkspaceState();
    dispatch({ type: "open" });
    try {
      // Restore the per-workspace "show hidden" preference before listing so
      // the first tree build already reflects the persisted value. A failed
      // read falls back to defaults rather than blocking workspace opening.
      let includeHidden = showHiddenRef.current;
      try {
        const settings = await readWorkspaceSettings(rootPath);
        if (rootPathRef.current !== rootPath) return;
        includeHidden = settings.showHidden;
        setShowHidden(settings.showHidden);
        showHiddenRef.current = settings.showHidden;
      } catch {
        if (rootPathRef.current !== rootPath) return;
        // Keep the in-memory default; the toggle still works for this session.
      }
      const snapshot = await api.openWorkspace(rootPath);
      if (rootPathRef.current !== rootPath) return;
      const entries = await api.listWorkspaceEntries(rootPath, includeHidden);
      if (rootPathRef.current !== rootPath) return;
      dispatch({ type: "opened", snapshot, entries });
      onWorkspaceOpened?.(rootPath, snapshot);
    } catch (error) {
      if (rootPathRef.current !== rootPath) return;
      dispatch({ type: "failed", message: workspaceErrorMessage(error) });
      if (restoring) onWorkspaceUnavailable?.(rootPath);
    }
  }, [api, clearWorkspaceState, onWorkspaceOpened, onWorkspaceUnavailable]);

  const refreshEntries = useCallback(async () => {
    const rootPath = rootPathRef.current;
    const snapshot = stateRef.current.snapshot;
    if (!rootPath || !snapshot) return;
    try {
      const entries = await apiRef.current.listWorkspaceEntries(rootPath, showHiddenRef.current);
      // Abort if the workspace changed while listing.
      if (rootPathRef.current !== rootPath) return;
      dispatch({ type: "opened", snapshot, entries });
    } catch (error) {
      setActionError(workspaceErrorMessage(error));
    }
  }, []);

  const launchWorkspace = useCallback(async (rootPath: string) => {
    try {
      await apiRef.current.openWorkspaceWindow(rootPath);
      callbacksRef.current.onWorkspaceLaunched?.(rootPath);
    } catch (error) {
      setActionError(workspaceErrorMessage(error));
    }
  }, []);

  /**
   * Toggles the "show hidden entries" preference, persists it to the current
   * workspace's settings, and re-lists entries so the tree updates without
   * reopening the workspace. Persistence failures are surfaced as action
   * errors but do not revert the in-memory toggle: the user can still see the
   * effect for this session and retry the toggle to write again.
   */
  const toggleShowHidden = useCallback(async () => {
    const rootPath = rootPathRef.current;
    const next = !showHiddenRef.current;
    setShowHidden(next);
    showHiddenRef.current = next;
    if (rootPath) {
      try {
        await writeWorkspaceSettings(rootPath, { showHidden: next });
      } catch (error) {
        setActionError(workspaceErrorMessage(error));
      }
    }
    await refreshEntries();
  }, [refreshEntries]);

  const openWorkspace = useCallback(async () => {
    try {
      const rootPath = await apiRef.current.pickWorkspaceDirectory();
      if (rootPath) await launchWorkspace(rootPath);
    } catch (error) {
      setActionError(workspaceErrorMessage(error));
    }
  }, [launchWorkspace]);

  useEffect(() => {
    if (initialWorkspacePath) {
      // Legitimate "load workspace when the path prop changes" effect: the
      // async loader intentionally flips the explorer into its "opening" phase
      // synchronously before the first await so the UI reflects the switch
      // immediately. The set-state-in-effect rule cannot model this lifecycle,
      // so the call is suppressed here rather than restructuring the load.
      void loadWorkspace(initialWorkspacePath, true);
    }
  }, [initialWorkspacePath, loadWorkspace]);

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
    [refreshEntries]
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
    setCreating({ parentPath: "", kind: "file", focusRequest: request });
    onNewNoteFocusHandled?.();
  }, [state.phase, onNewNoteFocusHandled, newNoteFocusRequest]);

  const handleMarkdownFileSelected = useCallback((relativePath: string) => {
    if (workspaceRootPath) onMarkdownFileSelected?.(workspaceRootPath, relativePath);
  }, [onMarkdownFileSelected, workspaceRootPath]);

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
      const entries = await apiRef.current.listWorkspaceEntries(rootPath, showHiddenRef.current);
      if (rootPathRef.current !== rootPath) return true;
      dispatch({ type: "opened", snapshot, entries });
      if (options?.selectMarkdown) {
        callbacksRef.current.onMarkdownFileCreated?.(rootPath, options.selectMarkdown);
        callbacksRef.current.onMarkdownFileSelected?.(rootPath, options.selectMarkdown);
      }
      return true;
    } catch (error) {
      setActionError(workspaceErrorMessage(error));
      return false;
    } finally {
      endOperation();
    }
  }, [endOperation, startOperation]);

  const submitCreate = useCallback(async (target: CreateState, name: string): Promise<boolean> => {
    const rootPath = stateRef.current.snapshot?.workspace.root_path;
    if (!rootPath) return false;
    const trimmed = name.trim();
    if (!trimmed) {
      setCreating(null);
      return true;
    }
    // Folders may use forward-slash-separated nested paths (e.g. `a/b/c`)
    // since the backend creates intermediate directories via `create_dir_all`.
    // Files still reject path separators so a single leaf entry is produced.
    if (target.kind === "folder") {
      if (!isValidFolderPath(trimmed)) {
        setActionError("Folder paths cannot contain '\\' or empty/`.`/`..` segments.");
        return false;
      }
    } else if (!isValidName(trimmed)) {
      setActionError("Names cannot contain path separators (/ or \\).");
      return false;
    }
    const relativePath = joinPath(target.parentPath, trimmed);
    const ok = await runWithRefresh(async () => {
      if (target.kind === "file") {
        await apiRef.current.createWorkspaceFile(rootPath, relativePath);
      } else {
        await apiRef.current.createWorkspaceFolder(rootPath, relativePath);
      }
    }, { selectMarkdown: target.kind === "file" && isMarkdownName(trimmed) ? relativePath : undefined });
    // Clear the inline input only on success; keep it open on failure so
    // the user can correct the name and retry.
    if (ok) setCreating(null);
    return ok;
  }, [runWithRefresh]);

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

  // ---- Folder expansion ----

  const expandFolder = useCallback((relativePath: string) => {
    setExpandedFolders((current) => current.has(relativePath) ? current : new Set(current).add(relativePath));
  }, []);
  const toggleFolder = useCallback((relativePath: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  }, []);
  const collapseFolder = useCallback((relativePath: string) => {
    setExpandedFolders((current) => {
      if (!current.has(relativePath)) return current;
      const next = new Set(current);
      next.delete(relativePath);
      return next;
    });
  }, []);

  const [activePath, setActivePath] = useState<string | null>(null);

  const visiblePaths = useMemo(() => visibleWorkspacePaths(tree, expandedFolders), [tree, expandedFolders]);

  const handleTreeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLUListElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (visiblePaths.length === 0) return;
      const currentPath = activePath ?? visiblePaths[0];
      if (!currentPath) return;
      const currentIndex = visiblePaths.indexOf(currentPath);
      if (currentIndex === -1) return;

      if (event.key === "ArrowDown") {
        const nextIndex = Math.min(currentIndex + 1, visiblePaths.length - 1);
        const nextPath = visiblePaths[nextIndex];
        if (nextPath) setActivePath(nextPath);
      } else {
        const prevIndex = Math.max(currentIndex - 1, 0);
        const prevPath = visiblePaths[prevIndex];
        if (prevPath) setActivePath(prevPath);
      }
    } else if (event.key === "Home") {
      event.preventDefault();
      const firstPath = visiblePaths[0];
      if (firstPath) setActivePath(firstPath);
    } else if (event.key === "End") {
      event.preventDefault();
      const lastPath = visiblePaths[visiblePaths.length - 1];
      if (lastPath) setActivePath(lastPath);
    }
  }, [visiblePaths, activePath]);

  // ---- Context menu ----

  const showContextMenu = useCallback((event: ReactMouseEvent, target: ContextMenuTarget) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, target });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Close the context menu on any outside interaction or Escape.
  useEffect(() => {
    if (!contextMenu) return;
    const onClose = () => setContextMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("click", onClose);
    window.addEventListener("resize", onClose);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const startCreate = useCallback((parentPath: string, kind: "file" | "folder") => {
    closeContextMenu();
    // Expand the target folder so the inline input is visible. Creating at the
    // workspace root (empty parentPath) needs no expansion.
    if (parentPath) expandFolder(parentPath);
    setCreating({ parentPath, kind, focusRequest: Date.now() });
  }, [closeContextMenu, expandFolder]);

  const startRename = useCallback((entry: NativeWorkspaceEntry) => {
    closeContextMenu();
    setRenaming({ entry, focusRequest: Date.now() });
  }, [closeContextMenu]);

  const showVersions = useCallback((entry: NativeWorkspaceEntry) => {
    closeContextMenu();
    const root = rootPathRef.current;
    if (root) onShowVersions?.(root, entry.relative_path);
  }, [closeContextMenu, onShowVersions]);

  const requestDelete = useCallback((entry: NativeWorkspaceEntry) => {
    closeContextMenu();
    setPendingDelete(entry);
  }, [closeContextMenu]);

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
      actionError={actionError}
      busy={busy}
      showHidden={showHidden}
      moreMenuOpen={moreMenuOpen}
      expandedFolders={expandedFolders}
      activePath={activePath}
      setActivePath={setActivePath}
      toggleShowHidden={toggleShowHidden}
      startCreate={startCreate}
      submitCreate={submitCreate}
      submitRename={submitRename}
      handleTreeKeyDown={handleTreeKeyDown}
      handleMarkdownFileSelected={handleMarkdownFileSelected}
      showContextMenu={showContextMenu}
      closeContextMenu={closeContextMenu}
      toggleFolder={toggleFolder}
      collapseFolder={collapseFolder}
      startRename={startRename}
      requestDelete={requestDelete}
    showVersions={showVersions}
      refreshEntries={refreshEntries}
      openWorkspace={openWorkspace}
      launchWorkspace={launchWorkspace}
      confirmDelete={confirmDelete}
      setMoreMenuOpen={setMoreMenuOpen}
      setRenaming={setRenaming}
      setCreating={setCreating}
      setPendingDelete={setPendingDelete}
      onDismissError={() => dispatch({ type: "dismiss" })}
      recentWorkspacePaths={recentWorkspacePaths}
    />
  );
});
