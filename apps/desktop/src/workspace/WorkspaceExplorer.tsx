import { memo, useCallback, useEffect, useId, useMemo, useReducer, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Check, ChevronDown, Folder, FolderOpen, FolderPlus, MoreHorizontal } from "lucide-react";
import type { NativeWorkspaceEntry, NativeWorkspaceSnapshot } from "../native/commands";
import {
  buildWorkspaceTree,
  initialWorkspaceExplorerState,
  workspaceErrorMessage,
  workspaceExplorerReducer,
  type WorkspaceTreeNode
} from "./workspaceExplorerModel";
import { workspaceDesktopApi, type WorkspaceDesktopApi } from "./workspaceAdapter";
import { subscribeExplorerToNoteChanges } from "./workspaceExplorerRefresh";
import {
  DEFAULT_WORKSPACE_SETTINGS,
  readWorkspaceSettings,
  writeWorkspaceSettings
} from "./workspaceSettings";
import { WorkspaceFileIcon } from "./WorkspaceFileIcon";
import { cn } from "../lib/utils";
import { handleMenuKeyDown } from "../shell/menuKeyboard";

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
  onWorkspaceLaunched
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
    rootPathRef.current = workspaceRootPath;
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
        includeHidden = settings.showHidden;
        setShowHidden(settings.showHidden);
        showHiddenRef.current = settings.showHidden;
      } catch {
        // Keep the in-memory default; the toggle still works for this session.
      }
      const snapshot = await api.openWorkspace(rootPath);
      const entries = await api.listWorkspaceEntries(rootPath, includeHidden);
      dispatch({ type: "opened", snapshot, entries });
      onWorkspaceOpened?.(rootPath, snapshot);
    } catch (error) {
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const visiblePaths = useMemo(() => {
    const paths: string[] = [];
    const traverse = (nodes: readonly WorkspaceTreeNode[]) => {
      for (const n of nodes) {
        paths.push(n.entry.relative_path);
        if (n.entry.kind === "directory" && expandedFolders.has(n.entry.relative_path)) {
          traverse(n.children);
        }
      }
    };
    traverse(tree);
    return paths;
  }, [tree, expandedFolders]);

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

  const requestDelete = useCallback((entry: NativeWorkspaceEntry) => {
    closeContextMenu();
    setPendingDelete(entry);
  }, [closeContextMenu]);

  const isBusy = state.phase === "opening" || busy;

  return (
    <section className={cn("flex min-h-0 flex-1 flex-col text-sidebar-foreground bg-sidebar font-sans", className)} aria-label="Workspace explorer" aria-busy={isBusy}>
      <header className="flex min-h-16 items-center justify-between gap-3 px-3 py-[0.625rem] border-b border-border">
        <div className="min-w-0">
          <p className="mb-[0.125rem] text-muted-foreground text-[0.625rem] font-bold tracking-[0.08em] leading-none uppercase">Workspace</p>
          <h2 className="max-w-[11rem] m-0 overflow-hidden text-[0.8125rem] font-[650] leading-tight truncate">{state.snapshot?.workspace.name ?? "No workspace open"}</h2>
        </div>
        <div className="relative">
          <button
            type="button"
            className={cn(
              "flex flex-none items-center justify-center w-[1.6rem] h-[1.6rem] border-0 rounded-small text-muted-foreground bg-transparent cursor-pointer font-inherit focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 [&>svg]:w-[0.95rem] [&>svg]:h-[0.95rem] [&>svg]:stroke-current",
              "not-aria-disabled:hover:bg-[color-mix(in_srgb,var(--color-accent)_58%,transparent)]",
              moreMenuOpen && "text-sidebar-foreground"
            )}
            aria-label="More actions"
            aria-expanded={moreMenuOpen}
            disabled={state.phase !== "ready"}
            onClick={() => setMoreMenuOpen((v) => !v)}
          >
            <MoreHorizontal aria-hidden="true" />
          </button>
          {moreMenuOpen && (
            <>
              {/* Click-away backdrop. */}
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default"
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => setMoreMenuOpen(false)}
              />
              <div
                className="absolute right-0 top-full mt-1 z-50 min-w-[11rem] border border-border rounded-small bg-popover py-1 text-popover-foreground shadow-soft"
                role="menu"
                aria-label="More actions"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setMoreMenuOpen(false);
                  }
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center justify-between gap-2 border-0 px-3 py-[0.4rem] bg-transparent cursor-pointer font-inherit text-xs text-left text-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  // The "show hidden" toggle keeps the menu open so the user
                  // can see the checkmark flip and the tree update beneath it.
                  onClick={() => void toggleShowHidden()}
                >
                  <span>Show hidden files</span>
                  {showHidden && <Check className="size-3.5" aria-hidden="true" />}
                </button>
                <hr className="my-1 border-0 border-t border-border" />
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 border-0 px-3 py-[0.4rem] bg-transparent cursor-pointer font-inherit text-xs text-left text-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  onClick={() => { setMoreMenuOpen(false); startCreate("", "folder"); }}
                >
                  <span>New folder</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 border-0 px-3 py-[0.4rem] bg-transparent cursor-pointer font-inherit text-xs text-left text-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  onClick={() => { setMoreMenuOpen(false); startCreate("", "file"); }}
                >
                  <span>New file</span>
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {state.phase === "empty" && <EmptyState />}
      {state.phase === "opening" && <StatusState message="Reading workspace entries…" />}
      {state.phase === "error" && <ErrorState message={state.error ?? "The workspace could not be opened."} onDismiss={() => dispatch({ type: "dismiss" })} />}
      {state.phase === "ready" && (
        <div
          className="flex min-h-0 flex-1 flex-col"
          aria-label={`${state.snapshot?.workspace.name} explorer`}
          onContextMenu={(event) => showContextMenu(event, { kind: "background" })}
        >
          <p className="m-0 overflow-hidden px-3 py-2 border-b border-border text-muted-foreground text-[0.6875rem] truncate" title={state.snapshot?.workspace.root_path}>
            {state.snapshot?.workspace.root_path}
          </p>
          {actionError && (
            <p className="m-0 px-3 py-[0.4rem] border-b border-[color-mix(in_srgb,var(--color-destructive)_45%,var(--color-border))] text-danger bg-[color-mix(in_srgb,var(--color-destructive)_9%,transparent)] text-[0.6875rem] leading-[1.4]" role="alert">{actionError}</p>
          )}
          {tree.length === 0 && !creating ? (
            <StatusState message="This workspace is empty. Right-click to create a new file or folder." />
          ) : (
            <ul
              className="min-h-0 flex-1 m-0 overflow-auto py-[0.375rem] list-none [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin]"
              role="tree"
              aria-label={`${state.snapshot?.workspace.name} files`}
              onKeyDown={handleTreeKeyDown}
            >
              {creating && creating.parentPath === "" && (
                <InlineNameInput
                  depth={0}
                  icon={creating.kind === "folder" ? <Folder /> : <WorkspaceFileIcon name="" />}
                  placeholder={creating.kind === "folder" ? "New folder name…" : "New file name…"}
                  ariaLabel={creating.kind === "folder" ? "New folder name" : "New file name"}
                  focusRequest={creating.focusRequest}
                  wrapInListItem
                  disabled={busy}
                  onSubmit={(name) => submitCreate(creating, name)}
                  onCancel={() => setCreating(null)}
                />
              )}
              {tree.map((node, index) => (
                <WorkspaceTreeItem
                  key={node.entry.relative_path}
                  node={node}
                  isFirst={index === 0}
                  activePath={activePath}
                  setActivePath={setActivePath}
                  onMarkdownFileSelected={handleMarkdownFileSelected}
                  onContextMenu={showContextMenu}
                  renaming={renaming}
                  creating={creating}
                  expandedFolders={expandedFolders}
                  onToggleFolder={toggleFolder}
                  onCollapseFolder={collapseFolder}
                  onSubmitRename={submitRename}
                  onSubmitCreate={submitCreate}
                  onCancelRename={() => setRenaming(null)}
                  onCancelCreate={() => setCreating(null)}
                  onStartRename={startRename}
                  onRequestDelete={requestDelete}
                  onStartCreate={startCreate}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {contextMenu && (
        <WorkspaceContextMenu
          menu={contextMenu}
          onClose={closeContextMenu}
          onStartCreate={startCreate}
          onStartRename={startRename}
          onRequestDelete={requestDelete}
          onRefresh={refreshEntries}
          onOpenWorkspace={openWorkspace}
        />
      )}

      {pendingDelete && (
        <DeleteConfirmDialog
          entry={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
      <WorkspaceSelector
        currentPath={workspaceRootPath}
        paths={recentWorkspacePaths}
        onAdd={() => void openWorkspace()}
        onSelect={(rootPath) => void launchWorkspace(rootPath)}
      />
    </section>
  );
});

// ---- Tree item ----

const WorkspaceTreeItem = memo(function WorkspaceTreeItem({
  node,
  depth = 0,
  isFirst = false,
  activePath,
  setActivePath,
  onMarkdownFileSelected,
  onContextMenu,
  renaming,
  creating,
  expandedFolders,
  onToggleFolder,
  onCollapseFolder,
  onSubmitRename,
  onSubmitCreate,
  onCancelRename,
  onCancelCreate,
  onStartRename,
  onRequestDelete,
  onStartCreate
}: {
  readonly node: WorkspaceTreeNode;
  readonly depth?: number;
  readonly isFirst?: boolean;
  readonly activePath: string | null;
  readonly setActivePath: (path: string) => void;
  readonly onMarkdownFileSelected: (relativePath: string) => void;
  readonly onContextMenu: (event: ReactMouseEvent, target: ContextMenuTarget) => void;
  readonly renaming: RenameState | null;
  readonly creating: CreateState | null;
  readonly expandedFolders: ReadonlySet<string>;
  readonly onToggleFolder: (relativePath: string) => void;
  readonly onCollapseFolder: (relativePath: string) => void;
  readonly onSubmitRename: (target: RenameState, newName: string) => Promise<boolean>;
  readonly onSubmitCreate: (target: CreateState, name: string) => Promise<boolean>;
  readonly onCancelRename: () => void;
  readonly onCancelCreate: () => void;
  readonly onStartRename: (entry: NativeWorkspaceEntry) => void;
  readonly onRequestDelete: (entry: NativeWorkspaceEntry) => void;
  readonly onStartCreate: (parentPath: string, kind: "file" | "folder") => void;
}) {
  const isDirectory = node.entry.kind === "directory";
  const isMarkdownFile = node.entry.kind === "file" && node.entry.is_markdown;
  // Dot-prefixed entries (e.g. `.git`, `.obsidian`) are visually dimmed when
  // the user has chosen to reveal them, so they remain distinguishable from
  // regular workspace content.
  const isHiddenEntry = node.entry.name.startsWith(".");
  // Folder expansion is lifted to the explorer so `startCreate` can expand a
  // folder before opening the inline input inside it.
  const isExpanded = expandedFolders.has(node.entry.relative_path);
  const isRenaming = renaming?.entry.relative_path === node.entry.relative_path;
  const isCreatingHere = creating?.parentPath === node.entry.relative_path;

  const isActive = activePath === node.entry.relative_path;
  const isFocusable = isActive || (activePath === null && isFirst);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isActive && document.activeElement !== buttonRef.current) {
      buttonRef.current?.focus();
    }
  }, [isActive]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        event.stopPropagation();
        if (isDirectory) {
          if (!isExpanded) {
            onToggleFolder(node.entry.relative_path);
          } else {
            const firstChild = node.children[0];
            if (firstChild) {
              setActivePath(firstChild.entry.relative_path);
            }
          }
        }
        break;
      case "ArrowLeft":
        event.preventDefault();
        event.stopPropagation();
        if (isDirectory && isExpanded) {
          onCollapseFolder(node.entry.relative_path);
        } else if (node.entry.parent_path) {
          setActivePath(node.entry.parent_path);
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        event.stopPropagation();
        if (isDirectory) {
          onToggleFolder(node.entry.relative_path);
        } else if (isMarkdownFile) {
          onMarkdownFileSelected(node.entry.relative_path);
        }
        break;
    }
  }, [isDirectory, isExpanded, isMarkdownFile, node, onToggleFolder, onCollapseFolder, setActivePath, onMarkdownFileSelected]);

  return (
    <li className="m-0 p-0" role="treeitem" aria-level={depth + 1} aria-expanded={isDirectory ? isExpanded : undefined}>
      {isRenaming ? (
        <InlineNameInput
          depth={depth}
          icon={isDirectory ? (isExpanded ? <FolderOpen /> : <Folder />) : <WorkspaceFileIcon name={node.entry.name} />}
          initialValue={node.entry.name}
          placeholder={`Rename ${node.entry.name}…`}
          ariaLabel={`Rename ${node.entry.name}`}
          focusRequest={renaming!.focusRequest}
          selectOnFocus
          onSubmit={(name) => onSubmitRename(renaming!, name)}
          onCancel={onCancelRename}
        />
      ) : (
        <button
          ref={buttonRef}
          className={cn(
            "flex w-full min-w-0 items-center gap-1.5 py-[0.265rem] pr-3 border-0 text-sidebar-foreground bg-transparent font-inherit text-xs leading-tight text-left aria-disabled:cursor-default not-aria-disabled:cursor-pointer not-aria-disabled:hover:bg-[color-mix(in_srgb,var(--color-accent)_58%,transparent)] not-aria-disabled:focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_58%,transparent)] focus-visible:outline-none",
            isHiddenEntry && "opacity-60"
          )}
          type="button"
          style={{ paddingLeft: `${0.75 + depth * 0.875}rem` }}
          aria-disabled={!isDirectory && !isMarkdownFile ? true : undefined}
          tabIndex={isFocusable ? 0 : -1}
          onKeyDown={handleKeyDown}
          onClick={() => {
            setActivePath(node.entry.relative_path);
            if (isDirectory) onToggleFolder(node.entry.relative_path);
            else if (isMarkdownFile) onMarkdownFileSelected(node.entry.relative_path);
          }}
          onContextMenu={(event) => {
            setActivePath(node.entry.relative_path);
            onContextMenu(event, { kind: isDirectory ? "folder" : "file", entry: node.entry });
          }}
          aria-label={isDirectory ? `${isExpanded ? "Collapse" : "Expand"} ${node.entry.name}` : isMarkdownFile ? `Open ${node.entry.name}` : undefined}
        >
          <span className="w-[0.625rem] flex-none text-muted-foreground text-center [&>svg]:w-[0.9rem] [&>svg]:h-[0.9rem] [&>svg]:stroke-current" aria-hidden="true">{isDirectory ? (isExpanded ? <FolderOpen /> : <Folder />) : <WorkspaceFileIcon name={node.entry.name} />}</span>
          <span className="min-w-0 truncate">{node.entry.name}</span>
        </button>
      )}
      {isDirectory && isExpanded && (
        <>
          {isCreatingHere && (
            <ul role="group" className="m-0 pl-[0.875rem] list-none">
              <InlineNameInput
                depth={depth + 1}
                icon={creating!.kind === "folder" ? <Folder /> : <WorkspaceFileIcon name="" />}
                placeholder={creating!.kind === "folder" ? "New folder name…" : "New file name…"}
                ariaLabel={creating!.kind === "folder" ? "New folder name" : "New file name"}
                focusRequest={creating!.focusRequest}
                wrapInListItem
                onSubmit={(name) => onSubmitCreate(creating!, name)}
                onCancel={onCancelCreate}
              />
            </ul>
          )}
          {node.children.length > 0 && (
            <ul role="group" className="m-0 pl-[0.875rem] list-none">
              {node.children.map((child) => (
                <WorkspaceTreeItem
                  key={child.entry.relative_path}
                  node={child}
                  depth={depth + 1}
                  isFirst={false}
                  activePath={activePath}
                  setActivePath={setActivePath}
                  onMarkdownFileSelected={onMarkdownFileSelected}
                  onContextMenu={onContextMenu}
                  renaming={renaming}
                  creating={creating}
                  expandedFolders={expandedFolders}
                  onToggleFolder={onToggleFolder}
                  onCollapseFolder={onCollapseFolder}
                  onSubmitRename={onSubmitRename}
                  onSubmitCreate={onSubmitCreate}
                  onCancelRename={onCancelRename}
                  onCancelCreate={onCancelCreate}
                  onStartRename={onStartRename}
                  onRequestDelete={onRequestDelete}
                  onStartCreate={onStartCreate}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
});

// ---- Inline editing ----

/**
 * Inline text input rendered in place of a tree row for rename and create.
 *
 * Commit on Enter, cancel on Escape. Blur does NOT auto-submit: a previous
 * version committed on blur, which raced with context-menu focus changes and
 * caused double-submit/cancel when the user opened a menu while editing. The
 * user must now explicitly press Enter to commit. If focus moves elsewhere
 * without Enter, the edit is treated as a cancel so no stale input lingers.
 */
function InlineNameInput({
  depth,
  icon,
  initialValue = "",
  placeholder,
  ariaLabel,
  focusRequest,
  selectOnFocus = false,
  wrapInListItem = false,
  disabled = false,
  onSubmit,
  onCancel
}: {
  readonly depth: number;
  readonly icon: ReactNode;
  readonly initialValue?: string;
  readonly placeholder?: string;
  readonly ariaLabel?: string;
  readonly focusRequest: number;
  readonly selectOnFocus?: boolean;
  readonly wrapInListItem?: boolean;
  readonly disabled?: boolean;
  readonly onSubmit: (value: string) => Promise<boolean>;
  readonly onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Track whether the user committed via Enter so the blur handler does not
  // also fire onCancel. Without this, Enter -> submit -> blur -> cancel would
  // double-fire.
  const committedRef = useRef(false);

  useEffect(() => {
    const element = inputRef.current;
    element?.focus();
    if (selectOnFocus) element?.select();
  }, [focusRequest, selectOnFocus]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      committedRef.current = true;
      onCancel();
    }
  };

  const handleSubmit = () => {
    if (disabled || submitting) return;
    committedRef.current = true;
    setSubmitting(true);
    void onSubmit(value).then((ok) => {
      if (!ok) committedRef.current = false;
    }).finally(() => setSubmitting(false));
  };

  const form = (
    <form
      className="flex w-full min-w-0 items-center gap-1.5 py-[0.265rem] pr-3 border-0 text-sidebar-foreground bg-transparent font-inherit text-xs leading-tight text-left"
      style={{ paddingLeft: `${0.75 + depth * 0.875}rem` }}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      <span className="w-[0.625rem] flex-none text-muted-foreground text-center [&>svg]:w-[0.9rem] [&>svg]:h-[0.9rem] [&>svg]:stroke-current" aria-hidden="true">{icon}</span>
      <input
        ref={inputRef}
        className="min-w-0 flex-1 border border-input rounded-small px-[0.3rem] py-[0.125rem] text-foreground bg-background font-inherit text-xs focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1"
        value={value}
        disabled={disabled || submitting}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        // On blur without an explicit commit/cancel, treat as cancel so the
        // input does not linger when the user clicks elsewhere or opens a menu.
        onBlur={() => {
          if (committedRef.current) return;
          committedRef.current = true;
          onCancel();
        }}
      />
    </form>
  );

  return wrapInListItem ? <li className="m-0 p-0">{form}</li> : form;
}

// ---- Context menu ----

type ContextMenuTarget =
  | { readonly kind: "background" }
  | { readonly kind: "file" | "folder"; readonly entry: NativeWorkspaceEntry };

interface ContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly target: ContextMenuTarget;
}

function WorkspaceContextMenu({ menu, onClose, onStartCreate, onStartRename, onRequestDelete, onRefresh, onOpenWorkspace }: {
  readonly menu: ContextMenuState;
  readonly onClose: () => void;
  readonly onStartCreate: (parentPath: string, kind: "file" | "folder") => void;
  readonly onStartRename: (entry: NativeWorkspaceEntry) => void;
  readonly onRequestDelete: (entry: NativeWorkspaceEntry) => void;
  readonly onRefresh: () => void;
  readonly onOpenWorkspace: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Keep the menu inside the viewport.
  const [position, setPosition] = useState({ x: menu.x, y: menu.y });
  useEffect(() => {
    const element = menuRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = Math.min(menu.x, window.innerWidth - rect.width - 8);
    const y = Math.min(menu.y, window.innerHeight - rect.height - 8);
    setPosition({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [menu.x, menu.y]);

  // Auto-focus the first item for keyboard navigation.
  useEffect(() => {
    const firstButton = menuRef.current?.querySelector("button");
    firstButton?.focus();
  }, []);

  const target = menu.target;
  // Create actions target the folder itself (for folders) or the parent (for files).
  const createParentPath = target.kind === "folder" ? target.entry.relative_path : target.kind === "file" ? target.entry.parent_path : "";

  const handle = (action: () => void) => (event: ReactMouseEvent) => {
    event.stopPropagation();
    action();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    handleMenuKeyDown(event, menuRef, onClose);
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-20 min-w-[11rem] border border-border rounded-small bg-popover shadow-soft py-1 text-xs"
      role="menu"
      aria-label="Workspace actions"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onKeyDown={handleKeyDown}
      onClick={(event) => event.stopPropagation()}
    >
      {target.kind === "folder" && <MenuButton label="New file" onClick={handle(() => onStartCreate(createParentPath, "file"))} />}
      {target.kind === "folder" && <MenuButton label="New folder" onClick={handle(() => onStartCreate(createParentPath, "folder"))} />}
      {target.kind === "background" && <MenuButton label="New file" onClick={handle(() => onStartCreate("", "file"))} />}
      {target.kind === "background" && <MenuButton label="New folder" onClick={handle(() => onStartCreate("", "folder"))} />}
      {target.kind !== "background" && <hr className="my-1 border-0 border-t border-border" />}
      {target.kind !== "background" && <MenuButton label="Rename" onClick={handle(() => onStartRename(target.entry))} />}
      {target.kind !== "background" && <MenuButton label="Delete" danger onClick={handle(() => onRequestDelete(target.entry))} />}
      {target.kind === "background" && <hr className="my-1 border-0 border-t border-border" />}
      {target.kind === "background" && <MenuButton label="Refresh" onClick={handle(() => { onRefresh(); onClose(); })} />}
      {target.kind === "background" && <MenuButton label="Open workspace…" onClick={handle(() => { onOpenWorkspace(); onClose(); })} />}
    </div>
  );
}

function MenuButton({ label, danger = false, onClick }: {
  readonly label: string;
  readonly danger?: boolean;
  readonly onClick: (event: ReactMouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 border-0 px-3 py-[0.4rem] bg-transparent cursor-pointer font-inherit text-xs text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
        danger ? "text-danger" : "text-foreground"
      )}
      role="menuitem"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// ---- Delete confirmation ----

function DeleteConfirmDialog({ entry, onCancel, onConfirm }: {
  readonly entry: NativeWorkspaceEntry;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const isFolder = entry.kind === "directory";
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const descriptionId = "delete-dialog-description";

  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    const index = focusable.indexOf(document.activeElement as HTMLButtonElement);
    event.preventDefault();
    focusable[(index + (event.shiftKey ? focusable.length - 1 : 1)) % focusable.length]?.focus();
  };

  return (
    <div className="fixed z-30 inset-0 flex items-start justify-center pt-[18vh] bg-overlay" role="presentation" onMouseDown={onCancel}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="grid gap-3 w-[min(25rem,calc(100vw-2rem))] p-[1.15rem] border border-border rounded-medium text-foreground bg-popover shadow-soft"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm deletion"
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="m-0 text-base font-semibold">Delete {isFolder ? "folder" : "file"}?</h2>
        <p id={descriptionId} className="m-0 text-muted-foreground text-[0.8rem] leading-[1.45]">
          {isFolder
            ? `"${entry.name}" and all of its contents will be permanently removed.`
            : `"${entry.name}" will be permanently removed.`}
        </p>
        <div className="flex flex-wrap justify-end gap-[0.45rem]">
          <button ref={cancelButtonRef} type="button" className="border border-border rounded-small px-[0.6rem] py-[0.4rem] text-foreground bg-surface cursor-pointer font-inherit text-xs" onClick={onCancel}>Cancel</button>
          <button type="button" className="border border-border rounded-small px-[0.6rem] py-[0.4rem] text-destructive-foreground bg-destructive cursor-pointer font-inherit text-xs" onClick={onConfirm}>Delete</button>
        </div>
      </section>
    </div>
  );
}

// ---- Helpers and small presentational components ----

function EmptyState() {
  return (
    <div className="my-auto p-5 text-muted-foreground text-xs leading-normal text-center">
      <strong className="block mb-1 text-sidebar-foreground text-[0.8125rem]">Choose a folder to begin</strong>
      <p className="m-0">ThinkBrain will show the current folder hierarchy without changing any files.</p>
    </div>
  );
}

function StatusState({ message }: { readonly message: string }) {
  return <p className="my-auto p-5 text-muted-foreground text-xs leading-normal text-center" role="status">{message}</p>;
}

function ErrorState({ message, onDismiss }: { readonly message: string; readonly onDismiss: () => void }) {
  return (
    <div className="m-3 p-5 border border-[color-mix(in_srgb,var(--color-destructive)_45%,var(--color-border))] rounded-small text-danger bg-[color-mix(in_srgb,var(--color-destructive)_9%,transparent)] text-xs leading-normal" role="alert">
      <strong className="block mb-1 text-sidebar-foreground text-[0.8125rem]">Could not open workspace</strong>
      <p className="m-0">{message}</p>
      <button type="button" className="mt-[0.625rem] border border-current rounded-small px-[0.4375rem] py-1 text-inherit bg-transparent cursor-pointer font-inherit text-[0.6875rem] hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)]" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

export function WorkspaceSelector({ currentPath, paths, onSelect, onAdd }: { readonly currentPath?: string; readonly paths: readonly string[]; readonly onSelect: (path: string) => void; readonly onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const options = [...new Set(currentPath ? [currentPath, ...paths] : paths)];
  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button[role='menuitem']") ?? []);
    const currentItem = items.find((item) => item.getAttribute("aria-current") === "true");
    (currentItem ?? items[0])?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!selectorRef.current?.contains(event.target as Node)) closeMenu();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu(true);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeMenu, open]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Restore focus to the trigger when Escape closes the selector menu.
    handleMenuKeyDown(event, menuRef, () => closeMenu(true));
  };

  return (
    <div ref={selectorRef} className="relative mt-auto border-t border-border">
      <button
        ref={triggerRef}
        className="flex w-full min-w-0 items-center gap-[0.45rem] border-0 text-sidebar-foreground bg-transparent cursor-pointer font-inherit text-xs text-left px-3 py-[0.65rem] [&>svg]:w-[0.9rem] [&>svg]:h-[0.9rem] [&>svg]:stroke-current [&>svg:last-child]:ml-auto"
        type="button"
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <Folder aria-hidden="true" />
        <span className="truncate">{currentPath?.split(/[\\/]/).at(-1) ?? "Choose workspace"}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div ref={menuRef} id={menuId} className="absolute z-20 right-2 bottom-[calc(100%+0.35rem)] left-2 overflow-hidden border border-border rounded-small bg-popover shadow-soft p-1" role="menu" aria-label="Workspaces" onKeyDown={handleKeyDown}>
          {options.map((path) => (
            <button
              key={path}
              type="button"
              className="flex w-full min-w-0 items-center gap-[0.45rem] border-0 text-sidebar-foreground bg-transparent cursor-pointer font-inherit text-xs text-left px-2 py-[0.45rem] rounded-small hover:bg-accent focus-visible:bg-accent focus-visible:outline-none [&>svg]:w-[0.9rem] [&>svg]:h-[0.9rem] [&>svg]:stroke-current"
              role="menuitem"
              aria-current={path === currentPath ? "true" : undefined}
              title={path}
              onClick={() => {
                closeMenu(true);
                onSelect(path);
              }}
            >
              <Folder aria-hidden="true" />
              <span className="truncate">{path.split(/[\\/]/).at(-1)}</span>
            </button>
          ))}
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-[0.45rem] border-0 text-sidebar-foreground bg-transparent cursor-pointer font-inherit text-xs text-left px-2 py-[0.45rem] rounded-small hover:bg-accent focus-visible:bg-accent focus-visible:outline-none [&>svg]:w-[0.9rem] [&>svg]:h-[0.9rem] [&>svg]:stroke-current"
            role="menuitem"
            onClick={() => { closeMenu(true); onAdd(); }}
          >
            <FolderPlus aria-hidden="true" />
            <span>Add workspace</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** Joins a parent path and a name into a workspace-relative path. */
function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

/** Reports whether a name has a Markdown extension (case-insensitive). */
function isMarkdownName(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

/**
 * Validates an inline rename/create name. Path separators are rejected so the
 * user cannot accidentally create nested directories by typing `sub/note.md`
 * in the name field; the backend would otherwise accept each segment.
 */
function isValidName(name: string): boolean {
  return !/[\\/]/.test(name);
}

/**
 * Validates an inline folder create path. Forward-slash-separated nested
 * paths (e.g. `a/b/c`) are allowed so the backend's `create_dir_all` can
 * build intermediate directories. Backslashes and empty/`.`/`..` segments
 * are rejected to keep paths workspace-relative and predictable.
 */
function isValidFolderPath(name: string): boolean {
  if (name.includes("\\")) return false;
  const segments = name.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") return false;
  }
  return true;
}

// State shapes used by the explorer for inline editing.
interface RenameState {
  readonly entry: NativeWorkspaceEntry;
  readonly focusRequest: number;
}

interface CreateState {
  readonly parentPath: string;
  readonly kind: "file" | "folder";
  readonly focusRequest: number;
}
