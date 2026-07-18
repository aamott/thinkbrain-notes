import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import type { NativeWorkspaceEntry, NativeWorkspaceSnapshot } from "../native/commands";
import {
  buildWorkspaceTree,
  initialWorkspaceExplorerState,
  workspaceErrorMessage,
  workspaceExplorerReducer,
  type WorkspaceTreeNode
} from "./workspaceExplorerModel";
import { workspaceDesktopApi, type WorkspaceDesktopApi } from "./workspaceAdapter";
import styles from "./WorkspaceExplorer.module.css";

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
  onNewNoteFocusHandled
}: WorkspaceExplorerProps) {
  const [state, dispatch] = useReducer(workspaceExplorerReducer, initialWorkspaceExplorerState);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const [creating, setCreating] = useState<CreateState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<NativeWorkspaceEntry | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<ReadonlySet<string>>(new Set());
  const tree = useMemo(() => buildWorkspaceTree(state.entries), [state.entries]);
  const workspaceRootPath = state.snapshot?.workspace.root_path;

  // Refs holding the latest state/props so async helpers never read stale
  // closures after an `await`. The workspace root captured before an operation
  // is compared to the current one after each `await`; if it changed (workspace
  // switched/closed), the in-flight refresh is aborted.
  const stateRef = useRef(state);
  const rootPathRef = useRef(workspaceRootPath);
  const apiRef = useRef(api);
  const callbacksRef = useRef({ onMarkdownFileCreated, onMarkdownFileSelected });
  // Refs are updated in an effect (not during render) per the react-hooks/refs
  // rule. Async helpers read `*.current` after each `await`.
  useEffect(() => {
    stateRef.current = state;
    rootPathRef.current = workspaceRootPath;
    apiRef.current = api;
    callbacksRef.current = { onMarkdownFileCreated, onMarkdownFileSelected };
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

  const loadWorkspace = useCallback(async (rootPath: string, restoring = false) => {
    dispatch({ type: "open" });
    try {
      const snapshot = await api.openWorkspace(rootPath);
      const entries = await api.listWorkspaceEntries(rootPath);
      dispatch({ type: "opened", snapshot, entries });
      onWorkspaceOpened?.(rootPath, snapshot);
    } catch (error) {
      dispatch({ type: "failed", message: workspaceErrorMessage(error) });
      if (restoring) onWorkspaceUnavailable?.(rootPath);
    }
  }, [api, onWorkspaceOpened, onWorkspaceUnavailable]);

  const refreshEntries = useCallback(async () => {
    const rootPath = rootPathRef.current;
    const snapshot = stateRef.current.snapshot;
    if (!rootPath || !snapshot) return;
    try {
      const entries = await apiRef.current.listWorkspaceEntries(rootPath);
      // Abort if the workspace changed while listing.
      if (rootPathRef.current !== rootPath) return;
      dispatch({ type: "opened", snapshot, entries });
    } catch (error) {
      setActionError(workspaceErrorMessage(error));
    }
  }, []);

  const openWorkspace = async () => {
    dispatch({ type: "pick" });
    try {
      const rootPath = await api.pickWorkspaceDirectory();
      if (!rootPath) {
        dispatch({ type: "cancel" });
        return;
      }
      await loadWorkspace(rootPath);
    } catch (error) {
      dispatch({ type: "failed", message: workspaceErrorMessage(error) });
    }
  };

  useEffect(() => {
    if (initialWorkspacePath) {
      void loadWorkspace(initialWorkspacePath, true);
    }
  }, [initialWorkspacePath, loadWorkspace]);

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
      const entries = await apiRef.current.listWorkspaceEntries(rootPath);
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

  const submitCreate = useCallback((target: CreateState, name: string) => {
    const rootPath = stateRef.current.snapshot?.workspace.root_path;
    if (!rootPath) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setCreating(null);
      return;
    }
    if (!isValidName(trimmed)) {
      setActionError("Names cannot contain path separators (/ or \\).");
      return;
    }
    const relativePath = joinPath(target.parentPath, trimmed);
    void runWithRefresh(async () => {
      if (target.kind === "file") {
        await apiRef.current.createWorkspaceFile(rootPath, relativePath);
      } else {
        await apiRef.current.createWorkspaceFolder(rootPath, relativePath);
      }
    }, { selectMarkdown: target.kind === "file" && isMarkdownName(trimmed) ? relativePath : undefined }).then((ok) => {
      // Clear the inline input only on success; keep it open on failure so
      // the user can correct the name and retry.
      if (ok) setCreating(null);
    });
  }, [runWithRefresh]);

  const submitRename = useCallback((target: RenameState, newName: string) => {
    const rootPath = stateRef.current.snapshot?.workspace.root_path;
    if (!rootPath) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === target.entry.name) {
      setRenaming(null);
      return;
    }
    if (!isValidName(trimmed)) {
      setActionError("Names cannot contain path separators (/ or \\).");
      return;
    }
    const newRelativePath = joinPath(target.entry.parent_path, trimmed);
    void runWithRefresh(async () => {
      await apiRef.current.renameWorkspaceEntry(rootPath, target.entry.relative_path, newRelativePath);
    }).then((ok) => {
      if (ok) setRenaming(null);
    });
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

  const isBusy = state.phase === "picking" || state.phase === "opening" || busy;
  const rootClassName = [styles.explorer, className].filter(Boolean).join(" ");

  return (
    <section className={rootClassName} aria-label="Workspace explorer" aria-busy={isBusy}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Workspace</p>
          <h2 className={styles.title}>{state.snapshot?.workspace.name ?? "No workspace open"}</h2>
        </div>
        <button className={styles.openButton} type="button" onClick={openWorkspace} disabled={isBusy}>
          {isBusy ? "Opening…" : "Open workspace"}
        </button>
      </header>

      {state.phase === "empty" && <EmptyState />}
      {state.phase === "picking" && <StatusState message="Waiting for a folder selection…" />}
      {state.phase === "opening" && <StatusState message="Reading workspace entries…" />}
      {state.phase === "cancelled" && <StatusState message="Folder selection cancelled." />}
      {state.phase === "error" && <ErrorState message={state.error ?? "The workspace could not be opened."} onDismiss={() => dispatch({ type: "dismiss" })} />}
      {state.phase === "ready" && (
        <div
          className={styles.treeRegion}
          aria-label={`${state.snapshot?.workspace.name} explorer`}
          onContextMenu={(event) => showContextMenu(event, { kind: "background" })}
        >
          <p className={styles.path} title={state.snapshot?.workspace.root_path}>
            {state.snapshot?.workspace.root_path}
          </p>
          {actionError && (
            <p className={styles.actionError} role="alert">{actionError}</p>
          )}
          {tree.length === 0 && !creating ? (
            <StatusState message="This workspace is empty. Right-click to create a new file or folder." />
          ) : (
            <ul className={styles.tree} role="tree" aria-label={`${state.snapshot?.workspace.name} files`}>
              {creating && creating.parentPath === "" && (
                <InlineNameInput
                  depth={0}
                  icon={creating.kind === "folder" ? "›" : "·"}
                  placeholder={creating.kind === "folder" ? "New folder name…" : "New file name…"}
                  ariaLabel={creating.kind === "folder" ? "New folder name" : "New file name"}
                  focusRequest={creating.focusRequest}
                  wrapInListItem
                  onSubmit={(name) => submitCreate(creating, name)}
                  onCancel={() => setCreating(null)}
                />
              )}
              {tree.map((node) => (
                <WorkspaceTreeItem
                  key={node.entry.relative_path}
                  node={node}
                  onMarkdownFileSelected={handleMarkdownFileSelected}
                  onContextMenu={showContextMenu}
                  renaming={renaming}
                  creating={creating}
                  expandedFolders={expandedFolders}
                  onToggleFolder={toggleFolder}
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
          <p className={styles.readOnlyNote}>Right-click files, folders, or the background for actions.</p>
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
    </section>
  );
});

// ---- Tree item ----

const WorkspaceTreeItem = memo(function WorkspaceTreeItem({
  node,
  depth = 0,
  onMarkdownFileSelected,
  onContextMenu,
  renaming,
  creating,
  expandedFolders,
  onToggleFolder,
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
  readonly onMarkdownFileSelected: (relativePath: string) => void;
  readonly onContextMenu: (event: ReactMouseEvent, target: ContextMenuTarget) => void;
  readonly renaming: RenameState | null;
  readonly creating: CreateState | null;
  readonly expandedFolders: ReadonlySet<string>;
  readonly onToggleFolder: (relativePath: string) => void;
  readonly onSubmitRename: (target: RenameState, newName: string) => void;
  readonly onSubmitCreate: (target: CreateState, name: string) => void;
  readonly onCancelRename: () => void;
  readonly onCancelCreate: () => void;
  readonly onStartRename: (entry: NativeWorkspaceEntry) => void;
  readonly onRequestDelete: (entry: NativeWorkspaceEntry) => void;
  readonly onStartCreate: (parentPath: string, kind: "file" | "folder") => void;
}) {
  const isDirectory = node.entry.kind === "directory";
  const isMarkdownFile = node.entry.kind === "file" && node.entry.is_markdown;
  // Folder expansion is lifted to the explorer so `startCreate` can expand a
  // folder before opening the inline input inside it.
  const isExpanded = expandedFolders.has(node.entry.relative_path);
  const isRenaming = renaming?.entry.relative_path === node.entry.relative_path;
  const isCreatingHere = creating?.parentPath === node.entry.relative_path;

  return (
    <li className={styles.treeItem} role="treeitem" aria-level={depth + 1} aria-expanded={isDirectory ? isExpanded : undefined}>
      {isRenaming ? (
        <InlineNameInput
          depth={depth}
          icon={isDirectory ? (isExpanded ? "⌄" : "›") : "·"}
          initialValue={node.entry.name}
          focusRequest={renaming!.focusRequest}
          selectOnFocus
          onSubmit={(name) => onSubmitRename(renaming!, name)}
          onCancel={onCancelRename}
        />
      ) : (
        <button
          className={styles.treeRow}
          type="button"
          style={{ paddingLeft: `${0.75 + depth * 0.875}rem` }}
          disabled={!isDirectory && !isMarkdownFile}
          onClick={() => {
            if (isDirectory) onToggleFolder(node.entry.relative_path);
            else if (isMarkdownFile) onMarkdownFileSelected(node.entry.relative_path);
          }}
          onContextMenu={(event) => onContextMenu(event, { kind: isDirectory ? "folder" : "file", entry: node.entry })}
          aria-label={isDirectory ? `${isExpanded ? "Collapse" : "Expand"} ${node.entry.name}` : isMarkdownFile ? `Open ${node.entry.name}` : undefined}
        >
          <span className={styles.treeIcon} aria-hidden="true">{isDirectory ? (isExpanded ? "⌄" : "›") : "·"}</span>
          <span className={styles.entryName}>{node.entry.name}</span>
          <EntryKind entry={node.entry} />
        </button>
      )}
      {isDirectory && isExpanded && (
        <>
          {isCreatingHere && (
            <ul role="group">
              <InlineNameInput
                depth={depth + 1}
                icon={creating!.kind === "folder" ? "›" : "·"}
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
            <ul role="group">
              {node.children.map((child) => (
                <WorkspaceTreeItem
                  key={child.entry.relative_path}
                  node={child}
                  depth={depth + 1}
                  onMarkdownFileSelected={onMarkdownFileSelected}
                  onContextMenu={onContextMenu}
                  renaming={renaming}
                  creating={creating}
                  expandedFolders={expandedFolders}
                  onToggleFolder={onToggleFolder}
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
  onSubmit,
  onCancel
}: {
  readonly depth: number;
  readonly icon: string;
  readonly initialValue?: string;
  readonly placeholder?: string;
  readonly ariaLabel?: string;
  readonly focusRequest: number;
  readonly selectOnFocus?: boolean;
  readonly wrapInListItem?: boolean;
  readonly onSubmit: (value: string) => void;
  readonly onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
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
    committedRef.current = true;
    onSubmit(value);
  };

  const form = (
    <form
      className={styles.treeRow}
      style={{ paddingLeft: `${0.75 + depth * 0.875}rem` }}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      <span className={styles.treeIcon} aria-hidden="true">{icon}</span>
      <input
        ref={inputRef}
        className={styles.renameInput}
        value={value}
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

  return wrapInListItem ? <li className={styles.treeItem}>{form}</li> : form;
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
  const isBackground = target.kind === "background";
  const isFolder = target.kind === "folder";
  const isFile = target.kind === "file";
  // Create actions target the folder itself (for folders) or the parent (for files).
  const createParentPath = isBackground ? "" : isFolder ? target.entry.relative_path : target.entry.parent_path;

  const handle = (action: () => void) => (event: ReactMouseEvent) => {
    event.stopPropagation();
    action();
  };

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      role="menu"
      aria-label="Workspace actions"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={(event) => event.stopPropagation()}
    >
      {isFolder && <MenuButton label="New file" onClick={handle(() => onStartCreate(createParentPath, "file"))} />}
      {isFolder && <MenuButton label="New folder" onClick={handle(() => onStartCreate(createParentPath, "folder"))} />}
      {isBackground && <MenuButton label="New file" onClick={handle(() => onStartCreate("", "file"))} />}
      {isBackground && <MenuButton label="New folder" onClick={handle(() => onStartCreate("", "folder"))} />}
      {(isFolder || isFile) && <hr className={styles.menuSeparator} />}
      {(isFolder || isFile) && <MenuButton label="Rename" onClick={handle(() => onStartRename(target.entry!))} />}
      {(isFolder || isFile) && <MenuButton label="Delete" danger onClick={handle(() => onRequestDelete(target.entry!))} />}
      {isBackground && <hr className={styles.menuSeparator} />}
      {isBackground && <MenuButton label="Refresh" onClick={handle(() => { onRefresh(); onClose(); })} />}
      {isBackground && <MenuButton label="Open workspace…" onClick={handle(() => { onOpenWorkspace(); onClose(); })} />}
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
      className={danger ? styles.menuItemDanger : styles.menuItem}
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
  return (
    <div className={styles.deleteBackdrop} role="presentation" onMouseDown={onCancel}>
      <section
        className={styles.deleteDialog}
        role="dialog"
        aria-modal="true"
        aria-label="Confirm deletion"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>Delete {isFolder ? "folder" : "file"}?</h2>
        <p>
          {isFolder
            ? `"${entry.name}" and all of its contents will be permanently removed.`
            : `"${entry.name}" will be permanently removed.`}
        </p>
        <div>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" onClick={onConfirm}>Delete</button>
        </div>
      </section>
    </div>
  );
}

// ---- Helpers and small presentational components ----

function EmptyState() {
  return <div className={styles.emptyState}><strong>Choose a folder to begin</strong><p>ThinkBrain will show the current folder hierarchy without changing any files.</p></div>;
}

function StatusState({ message }: { readonly message: string }) {
  return <p className={styles.status} role="status">{message}</p>;
}

function ErrorState({ message, onDismiss }: { readonly message: string; readonly onDismiss: () => void }) {
  return <div className={styles.error} role="alert"><strong>Could not open workspace</strong><p>{message}</p><button type="button" onClick={onDismiss}>Dismiss</button></div>;
}

function EntryKind({ entry }: { readonly entry: NativeWorkspaceEntry }) {
  if (entry.kind === "directory") return <span className={styles.entryKind}>Folder</span>;
  return <span className={styles.entryKind}>{entry.is_markdown ? "Markdown" : "File"}</span>;
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
