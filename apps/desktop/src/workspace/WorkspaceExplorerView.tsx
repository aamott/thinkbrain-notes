import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { ChevronDown, File, FilePlus, Folder, FolderGit2, FolderOpen, FolderPlus, Link, MoreHorizontal, RefreshCw } from "lucide-react";
import type { NativeWorkspaceAccessCapabilities, NativeWorkspaceEntry } from "../native/commands";
import type { WorkspaceExplorerState, WorkspaceTreeNode } from "./workspaceExplorerModel";
import { WorkspaceFileIcon } from "./WorkspaceFileIcon";
import { cn } from "../lib/utils";
import { Menu, MenuButton, MenuCheckbox } from "../shell/Menu";
import { WorkspaceTreeItem, InlineNameInput } from "./WorkspaceTree";
import { DeleteConfirmDialog, WorkspaceContextMenu } from "./WorkspaceExplorerMenus";
import { CreateFileTypeConfirmDialog } from "./CreateFileTypeConfirmDialog";
import { GitLinkImportDialog } from "./GitLinkImportDialog";
import { CREATE_MANAGED_WORKSPACE_LABEL, IMPORT_FROM_GIT_LABEL, OPEN_FOLDER_LABEL } from "./gitLinkImportCopy";
import { isWorkspaceGitLinked } from "./workspaceSettings";
import { WorkspaceSelectorPortal } from "./WorkspaceSelectorPortal";
import { useWorkspaceSelectorOutlet, type WorkspaceSelectorVariant } from "./WorkspaceSelectorPortalModel";
import { isNewNoteCreate, type ContextMenuState, type CreateState, type PendingExtensionConfirm, type RenameState, type WorkspaceExplorerActions } from "./workspaceExplorerTypes";
import { useWorkspaceTreeDrag, WORKSPACE_DROP_ROOT_ATTR, type WorkspaceTreeDrag } from "./useWorkspaceTreeDrag";
import { useWorkspaceFileDrag } from "./useWorkspaceFileDrag";

interface WorkspaceExplorerViewProps {
  readonly className?: string;
  readonly state: WorkspaceExplorerState;
  readonly tree: readonly WorkspaceTreeNode[];
  readonly workspaceRootPath?: string;
  readonly contextMenu: ContextMenuState | null;
  readonly renaming: RenameState | null;
  readonly creating: CreateState | null;
  readonly pendingDelete: NativeWorkspaceEntry | null;
  readonly pendingExtensionConfirm: PendingExtensionConfirm | null;
  readonly inlineCreateError: string | null;
  readonly extensionConfirmError: string | null;
  readonly actionError: string | null;
  readonly busy: boolean;
  readonly showHidden: boolean;
  readonly moreMenuOpen: boolean;
  readonly expandedFolders: ReadonlySet<string>;
  readonly activePath: string | null;
  readonly accessCapabilities: NativeWorkspaceAccessCapabilities | null;
  readonly recentWorkspacePaths: readonly string[];
  readonly actions: WorkspaceExplorerActions;
  readonly createManagedWorkspaceOpen: boolean;
  readonly managedStorageNoticeOpen: boolean;
  readonly importFromGitOpen: boolean;
  /** Renders the selector inside the header row when it lives in panel headers. */
  readonly workspaceSelectorInPanel?: boolean;
}

export function WorkspaceExplorerView({
  className,
  state,
  tree,
  workspaceRootPath,
  contextMenu,
  renaming,
  creating,
  pendingDelete,
  pendingExtensionConfirm,
  inlineCreateError,
  extensionConfirmError,
  actionError,
  busy,
  showHidden,
  moreMenuOpen,
  expandedFolders,
  activePath,
  accessCapabilities,
  recentWorkspacePaths,
  actions,
  createManagedWorkspaceOpen,
  managedStorageNoticeOpen,
  importFromGitOpen,
  workspaceSelectorInPanel = false
}: WorkspaceExplorerViewProps) {
  const isBusy = state.phase === "opening" || busy;
  // The menu has to know its own trigger, or the press that closes it counts
  // as an outside click first and it shuts and reopens in one gesture.
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  // With the selector placed in panel headers, the explorer draws it inline —
  // except while another opted panel's title slot is hosting it (the explorer
  // stays mounted but hidden when e.g. Search is active).
  const outlet = useWorkspaceSelectorOutlet();
  const showInlineSelector = workspaceSelectorInPanel && outlet?.variant !== "panel";
  // The row a context menu was opened on keeps a selection outline for as
  // long as the menu is up — otherwise there is no visible link between the
  // two once the pointer moves off the row.
  const contextMenuPath =
    contextMenu && contextMenu.target.kind !== "background"
      ? contextMenu.target.entry.relative_path
      : null;

  // Same controller props wherever the selector lands — inline, title bar, or
  // drawer — so switching and its dialogs behave identically per placement.
  const renderSelector = (variant: WorkspaceSelectorVariant, onAction?: () => void) => (
    <WorkspaceSelector
      variant={variant}
      onAction={onAction}
      capabilities={accessCapabilities}
      currentPath={workspaceRootPath}
      paths={recentWorkspacePaths}
      onAdd={actions.openWorkspace}
      onCreateManaged={() => actions.setCreateManagedWorkspaceOpen(true)}
      onImportFromGit={actions.openGitLinkImport}
      onSelect={actions.launchWorkspace}
    />
  );

  // Visible folders in tree order are the keyboard destination cycle; a folder
  // is visible only when every ancestor is expanded.
  const folderPaths = useMemo(() => {
    const paths: string[] = [];
    const visit = (nodes: readonly WorkspaceTreeNode[]) => {
      for (const node of nodes) {
        if (node.entry.kind !== "directory") continue;
        paths.push(node.entry.relative_path);
        if (expandedFolders.has(node.entry.relative_path)) visit(node.children);
      }
    };
    visit(tree);
    return paths;
  }, [tree, expandedFolders]);

  // Two controllers, one facade: HTML5 drags (desktop — they can leave the
  // window into a system file manager) and pointer/touch drags (mobile + the
  // keyboard interface). `html5Active` disarms pointer arming for mouse/pen
  // so the two never compete for one gesture.
  const treeScrollRef = useRef<HTMLUListElement | null>(null);
  const fileDrag = useWorkspaceFileDrag({
    rootPath: workspaceRootPath ?? null,
    isExpanded: (path) => expandedFolders.has(path),
    expandFolder: actions.expandFolder,
    moveEntry: actions.moveEntry,
    containerRef: treeScrollRef
  });
  const pointerDrag = useWorkspaceTreeDrag({
    folderPaths,
    isExpanded: (path) => expandedFolders.has(path),
    expandFolder: actions.expandFolder,
    moveEntry: actions.moveEntry,
    openContextMenu: (entry, x, y) => {
      actions.setActivePath(entry.relative_path);
      actions.showContextMenuAt(x, y, {
        kind: entry.kind === "directory" ? "folder" : "file",
        entry
      });
    },
    containerRef: treeScrollRef,
    html5Active: fileDrag.enabled
  });
  const cancelPointerDrag = pointerDrag.cancel;
  const cancelFileDrag = fileDrag.cancel;
  const cancelDrag = useCallback(() => {
    cancelPointerDrag();
    cancelFileDrag();
  }, [cancelPointerDrag, cancelFileDrag]);
  const drag: WorkspaceTreeDrag = {
    ...pointerDrag,
    draggedPath: pointerDrag.draggedPath ?? fileDrag.draggedPath,
    dropTargetPath: pointerDrag.dropTargetPath ?? fileDrag.dropTargetPath,
    dropTargetValid:
      pointerDrag.dropTargetPath !== null ? pointerDrag.dropTargetValid : fileDrag.dropTargetValid,
    announcement: fileDrag.announcement || pointerDrag.announcement,
    cancel: cancelDrag,
    draggable: fileDrag.enabled,
    onRowDragStart: fileDrag.onRowDragStart,
    onRowDragOver: fileDrag.onRowDragOver,
    onRowDragLeave: fileDrag.onRowDragLeave,
    onRowDrop: fileDrag.onRowDrop,
    onRowDragEnd: fileDrag.onDragEnd
  };

  // Switching workspaces mid-drag must drop the gesture rather than land it
  // on a destination in a different vault.
  useEffect(() => cancelDrag, [workspaceRootPath, cancelDrag]);

  return (
    <section className={cn("flex min-h-0 flex-1 flex-col text-sidebar-foreground bg-sidebar font-sans", className)} aria-label="Workspace explorer" aria-busy={isBusy}>
      {/* Keyboard and pointer drags announce progress here. */}
      <p className="sr-only" aria-live="polite">{drag.announcement}</p>
      {/* One chrome row: the selector trigger when it lives in panel
          headers, otherwise the plain "Files" label — the root path survives
          as its tooltip. Create icons hover-reveal on fine pointers; the ⋯
          menu is always visible so the row never looks action-less. */}
      <header className="group/explorer-header flex min-h-9 items-center justify-between gap-2 border-b border-border px-3 pointer-coarse:min-h-12 pointer-coarse:px-4">
        <div className="flex min-w-0 flex-1 items-center">
          {showInlineSelector ? (
            renderSelector("panel")
          ) : (
            <h2
              className="m-0 truncate text-[0.68rem] tracking-[0.08em] uppercase font-semibold pointer-coarse:text-sm pointer-coarse:tracking-normal pointer-coarse:normal-case"
              title={workspaceRootPath}
            >
              Files
            </h2>
          )}
        </div>
        <div className="flex flex-none items-center gap-0.5">
          <div
            className="tn-explorer-create-reveal flex items-center gap-0.5"
            data-open={moreMenuOpen || undefined}
          >
            <button
              type="button"
              className={HEADER_ACTION_CLASSES}
              aria-label="New note"
              title="New note"
              disabled={state.phase !== "ready"}
              onClick={() => actions.startCreate("", "file", "new-note")}
            >
              <FilePlus aria-hidden="true" />
            </button>
            <button
              type="button"
              className={HEADER_ACTION_CLASSES}
              aria-label="New folder"
              title="New folder"
              disabled={state.phase !== "ready"}
              onClick={() => actions.startCreate("", "folder")}
            >
              <FolderPlus aria-hidden="true" />
            </button>
          </div>
          <div className="relative">
            <button
              ref={moreButtonRef}
              type="button"
              className={cn(HEADER_ACTION_CLASSES, moreMenuOpen && "text-sidebar-foreground")}
              aria-label="More actions"
              aria-expanded={moreMenuOpen}
              onClick={() => actions.setMoreMenuOpen((value) => !value)}
            >
              <MoreHorizontal aria-hidden="true" />
            </button>
            {moreMenuOpen && (
              <Menu
                label="More actions"
                className="absolute right-0 top-full mt-1 z-50"
                anchorRef={moreButtonRef}
                onClose={() => actions.setMoreMenuOpen(false)}
              >
                {/* Stays open, so the user can watch the tick flip and the tree
                    update underneath it. */}
                <MenuCheckbox
                  label="Show hidden files"
                  checked={showHidden}
                  onClick={() => void actions.toggleShowHidden()}
                />
                <hr className="my-1 border-0 border-t border-border" />
                {/* The generic, extension-free create; the header icon is the
                    canonical New note flow with its .md conventions. */}
                <MenuButton
                  icon={<File />}
                  label="New file"
                  onClick={() => { actions.setMoreMenuOpen(false); actions.startCreate("", "file"); }}
                />
                <MenuButton
                  icon={<RefreshCw />}
                  label="Refresh"
                  onClick={() => { actions.setMoreMenuOpen(false); void actions.refreshEntries(); }}
                />
                <MenuButton
                  icon={<FolderOpen />}
                  label="Open workspace…"
                  onClick={() => { actions.setMoreMenuOpen(false); void actions.openWorkspace(); }}
                />
              </Menu>
            )}
          </div>
        </div>
      </header>

      {actionError && state.phase !== "ready" && (
        <p className="m-0 px-3 py-[0.4rem] border-b border-[color-mix(in_srgb,var(--color-destructive)_45%,var(--color-border))] text-danger bg-[color-mix(in_srgb,var(--color-destructive)_9%,transparent)] text-[0.6875rem] leading-1.4" role="alert">{actionError}</p>
      )}
      {state.phase === "empty" && (
        accessCapabilities
          ? <EmptyState managed={accessCapabilities.canCreateManagedWorkspace} />
          : <StatusState message="Checking workspace access…" />
      )}
      {state.phase === "opening" && <StatusState message="Reading workspace entries…" />}
      {state.phase === "error" && <ErrorState message={state.error ?? "The workspace could not be opened."} onDismiss={actions.dismissError} />}
      {state.phase === "ready" && (
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            drag.dropTargetPath === "" &&
              (drag.dropTargetValid
                ? "bg-[color-mix(in_srgb,var(--color-accent)_18%,transparent)]"
                : "bg-[color-mix(in_srgb,var(--color-destructive)_12%,transparent)]")
          )}
          aria-label={`${state.snapshot?.workspace.name} explorer`}
          // Anywhere in this region — the path header, tree whitespace, the
          // empty state — is a valid drop at the workspace root. File rows
          // mark themselves so they do not fall back to it.
          {...{ [WORKSPACE_DROP_ROOT_ATTR]: "" }}
          onContextMenu={(event) => actions.showContextMenu(event, { kind: "background" })}
          onDragOver={fileDrag.onRootDragOver}
          onDrop={fileDrag.onRootDrop}
        >
          {actionError && (
            <p className="m-0 px-3 py-[0.4rem] border-b border-[color-mix(in_srgb,var(--color-destructive)_45%,var(--color-border))] text-danger bg-[color-mix(in_srgb,var(--color-destructive)_9%,transparent)] text-[0.6875rem] leading-1.4" role="alert">{actionError}</p>
          )}
          {tree.length === 0 && !creating ? (
            <StatusState message="This workspace is empty. Right-click to create a new file or folder." />
          ) : (
            <ul
              ref={treeScrollRef}
              className="tn-scrollbar-left min-h-0 flex-1 m-0 overflow-auto py-1.5 list-none [scrollbar-color:var(--color-border)_transparent] scrollbar-thin"
              role="tree"
              aria-label={`${state.snapshot?.workspace.name} files`}
              onKeyDown={actions.handleTreeKeyDown}
            >
              {creating && creating.parentPath === "" && (
                <InlineNameInput
                  key={creating.focusRequest}
                  depth={0}
                  icon={creating.kind === "folder" ? <Folder /> : <WorkspaceFileIcon name="" />}
                  initialValue={isNewNoteCreate(creating) ? ".md" : ""}
                  caretBeforeExtension={isNewNoteCreate(creating)}
                  placeholder={creating.kind === "folder" ? "New folder name…" : "New file name…"}
                  ariaLabel={creating.kind === "folder" ? "New folder name" : "New file name"}
                  focusRequest={creating.focusRequest}
                  wrapInListItem
                  disabled={busy}
                  error={isNewNoteCreate(creating) ? inlineCreateError : null}
                  onEdit={() => actions.setInlineCreateError(null)}
                  onSubmit={(name) => actions.submitCreate(creating, name)}
                  onCancel={() => actions.setCreating(null)}
                />
              )}
              {tree.map((node, index) => (
                <WorkspaceTreeItem
                  key={node.entry.relative_path}
                  node={node}
                  isFirst={index === 0}
                  activePath={activePath}
                  contextMenuPath={contextMenuPath}
                  renaming={renaming}
                  creating={creating}
                  expandedFolders={expandedFolders}
                  actions={actions}
                  drag={drag}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {contextMenu && (
        <WorkspaceContextMenu menu={contextMenu} actions={actions} rootPath={workspaceRootPath ?? null} />
      )}

      {pendingDelete && (
        <DeleteConfirmDialog
          entry={pendingDelete}
          onCancel={() => actions.setPendingDelete(null)}
          onConfirm={() => void actions.confirmDelete()}
        />
      )}
      {pendingExtensionConfirm && (
        <CreateFileTypeConfirmDialog
          fileName={pendingExtensionConfirm.name}
          busy={busy}
          error={extensionConfirmError}
          onKeepEditing={actions.dismissExtensionConfirm}
          onCreateAnyway={() => void actions.confirmExtensionCreate()}
        />
      )}
      {managedStorageNoticeOpen && (
        <ManagedStorageNotice onDismiss={() => actions.setManagedStorageNoticeOpen(false)} />
      )}
      <WorkspaceSelectorPortal>{renderSelector}</WorkspaceSelectorPortal>
      {createManagedWorkspaceOpen && (
        <CreateManagedWorkspaceDialog
          busy={busy}
          error={actionError}
          onCancel={() => actions.setCreateManagedWorkspaceOpen(false)}
          onCreate={actions.createManagedWorkspace}
        />
      )}
      {importFromGitOpen && (
        <GitLinkImportDialog
          managedDestination={accessCapabilities?.canCreateManagedWorkspace === true}
          onClose={() => actions.setImportFromGitOpen(false)}
          onImported={accessCapabilities?.canCreateManagedWorkspace
            ? (rootPath) => void actions.launchWorkspace(rootPath)
            : undefined}
        />
      )}
    </section>
  );
}

// ---- Helpers and small presentational components ----

// Shared chrome-row action button: 26px on fine pointers, grows to a
// touch-friendly 36px on coarse ones.
const HEADER_ACTION_CLASSES = cn(
  "flex flex-none items-center justify-center size-[1.6rem] border-0 rounded-small text-muted-foreground bg-transparent cursor-pointer font-inherit",
  "focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 [&>svg]:stroke-current [&>svg]:size-[0.95rem]",
  "not-aria-disabled:hover:bg-[color-mix(in_srgb,var(--color-accent)_58%,transparent)]",
  "disabled:cursor-default disabled:opacity-50",
  "pointer-coarse:size-9"
);

function EmptyState({ managed }: { readonly managed: boolean }) {
  return (
    <div className="my-auto p-5 text-muted-foreground text-xs leading-normal text-center">
      <strong className="block mb-1 text-sidebar-foreground text-[0.8125rem]">
        {managed ? "Create or clone a vault to begin" : "Choose a folder to begin"}
      </strong>
      <p className="m-0">
        {managed
          ? "ThinkBrain keeps Android vaults in managed app storage."
          : "ThinkBrain will show the current folder hierarchy without changing any files."}
      </p>
    </div>
  );
}

function ManagedStorageNotice({ onDismiss }: { readonly onDismiss: () => void }) {
  return (
    <div className="m-2 rounded-small border border-warning/50 bg-warning/10 p-2 text-[0.6875rem] leading-relaxed text-sidebar-foreground" role="status">
      <p className="m-0">Android removes managed vaults when the app is uninstalled. Keep another copy using Git or an explicit backup/export when available.</p>
      <button type="button" className="mt-1.5 min-h-11 rounded-small border border-border px-3 text-[0.6875rem]" onClick={onDismiss}>Got it</button>
    </div>
  );
}

function CreateManagedWorkspaceDialog({
  busy,
  error,
  onCancel,
  onCreate
}: {
  readonly busy: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onCreate: (name: string) => Promise<boolean>;
}) {
  const titleId = useId();
  const [name, setName] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!busy && name.trim()) void onCreate(name);
  };
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-overlay pt-[18vh]" role="presentation">
      <form
        className="grid w-[min(26rem,calc(100vw-2rem))] gap-3 rounded-medium border border-border bg-popover p-4 shadow-soft"
        aria-labelledby={titleId}
        aria-busy={busy}
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) onCancel();
        }}
        onSubmit={submit}
      >
        <h2 id={titleId} className="m-0 text-base font-semibold">Create managed vault</h2>
        <label className="grid gap-1 text-xs">
          Vault name
          <input autoFocus className="min-h-11 rounded-small border border-border bg-surface px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={busy} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">The vault is stored privately by the app and is removed if Android uninstalls it.</p>
        {error && <p className="m-0 text-xs text-danger" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="min-h-11 rounded-small border border-border px-3 text-xs" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="submit" className="min-h-11 rounded-small bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50" disabled={busy || !name.trim()}>Create</button>
        </div>
      </form>
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
      <button type="button" className="mt-2.5 border border-current rounded-small px-1.75 py-1 text-inherit cursor-pointer font-inherit text-[0.6875rem] hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)]" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

const selectorRootClasses: Record<WorkspaceSelectorVariant, string> = {
  drawer: "relative border-b border-border px-3 pb-3",
  titlebar: "relative min-w-0 flex-1",
  panel: "relative min-w-0 flex-1"
};

const selectorTriggerClasses: Record<WorkspaceSelectorVariant, string> = {
  drawer: "min-h-11 rounded-medium border border-border bg-background px-3 py-2 text-sm font-semibold text-sidebar-foreground shadow-sm",
  titlebar: "h-7 rounded-small border border-border bg-background px-2 text-xs font-semibold text-titlebar-foreground",
  panel: "h-7 rounded-small px-1.5 text-[0.8125rem] font-semibold text-sidebar-foreground"
};

const selectorMenuClasses: Record<WorkspaceSelectorVariant, string> = {
  drawer: "absolute top-[calc(100%+0.35rem)] right-3 left-3 z-50",
  titlebar: "absolute top-[calc(100%+0.35rem)] left-0 z-50 min-w-60",
  panel: "absolute top-[calc(100%+0.35rem)] right-0 left-0 z-50"
};

export function WorkspaceSelector({
  variant,
  capabilities,
  currentPath,
  paths,
  onAction,
  onSelect,
  onAdd,
  onCreateManaged,
  onImportFromGit
}: {
  readonly variant: WorkspaceSelectorVariant;
  readonly capabilities: NativeWorkspaceAccessCapabilities | null;
  readonly currentPath?: string;
  readonly paths: readonly string[];
  readonly onAction?: () => void;
  readonly onSelect: (path: string) => void;
  readonly onAdd: () => void;
  readonly onCreateManaged: () => void;
  readonly onImportFromGit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [gitLinkedPaths, setGitLinkedPaths] = useState<ReadonlySet<string>>(new Set());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const options = useMemo(
    () => [...new Set(currentPath ? [currentPath, ...paths] : paths)],
    [currentPath, paths]
  );
  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const optionsKey = options.join("\0");
  // The current workspace's Git-linked badge shows on the closed trigger, so
  // it is probed eagerly; the per-option icons inside the menu only matter
  // once it opens, and each probe is a settings-file read.
  useEffect(() => {
    if (!currentPath) return;
    let cancelled = false;
    isWorkspaceGitLinked(currentPath)
      .then((linked) => {
        if (!cancelled && linked) {
          setGitLinkedPaths((previous) => new Set(previous).add(currentPath));
        }
      })
      .catch(() => {
        // Unreadable or absent settings fall back to a plain folder icon.
      });
    return () => {
      cancelled = true;
    };
  }, [currentPath]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all(
      options.map(async (path) => {
        const linked = await isWorkspaceGitLinked(path);
        return linked ? path : null;
      })
    ).then((results) => {
      if (!cancelled) {
        setGitLinkedPaths(new Set(results.filter((p): p is string => p !== null)));
      }
    }).catch(() => {
      // Unreadable or absent settings fall back to plain folder
    });
    return () => {
      cancelled = true;
    };
  }, [open, optionsKey, options]);

  const currentIsGitLinked = currentPath ? gitLinkedPaths.has(currentPath) : false;
  const currentFolderName = currentPath?.split(/[\\/]/).at(-1) ?? "Choose workspace";

  return (
    <div className={selectorRootClasses[variant]}>
      <button
        ref={triggerRef}
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center gap-[0.45rem] text-left font-inherit hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 disabled:cursor-default disabled:opacity-60 [&>svg]:size-[0.9rem] [&>svg]:shrink-0 [&>svg]:stroke-current [&>svg:last-child]:ml-auto",
          selectorTriggerClasses[variant]
        )}
        type="button"
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={currentIsGitLinked ? `${currentFolderName} (Git-linked workspace)` : currentFolderName}
        disabled={capabilities === null}
        onClick={() => setOpen((value) => !value)}
      >
        {currentIsGitLinked ? <FolderGit2 aria-hidden="true" /> : <Folder aria-hidden="true" />}
        <span className="truncate">{currentFolderName}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <Menu
          id={menuId}
          label="Workspaces"
          className={selectorMenuClasses[variant]}
          anchorRef={triggerRef}
          // Leaving by Escape puts focus back on the trigger; clicking
          // somewhere else has already decided where focus belongs.
          onClose={(reason) => closeMenu(reason === "escape")}
        >
          {options.map((path) => {
            const isLinked = gitLinkedPaths.has(path);
            const folderName = path.split(/[\\/]/).at(-1) ?? path;
            return (
              <MenuButton
                key={path}
                icon={isLinked ? <FolderGit2 /> : <Folder />}
                label={folderName}
                ariaLabel={isLinked ? `${folderName} (Git-linked workspace)` : folderName}
                title={isLinked ? `${path} (Git-linked workspace)` : path}
                current={path === currentPath}
                onClick={() => {
                  closeMenu(true);
                  onAction?.();
                  onSelect(path);
                }}
              />
            );
          })}
          {capabilities?.canOpenFolder && (
            <MenuButton
              icon={<FolderPlus />}
              label={OPEN_FOLDER_LABEL}
              onClick={() => {
                closeMenu(true);
                onAction?.();
                onAdd();
              }}
            />
          )}
          {capabilities?.canCreateManagedWorkspace && (
            <MenuButton
              icon={<FolderPlus />}
              label={CREATE_MANAGED_WORKSPACE_LABEL}
              onClick={() => {
                closeMenu(true);
                onAction?.();
                onCreateManaged();
              }}
            />
          )}
          {(capabilities?.canOpenFolder || capabilities?.canCreateManagedWorkspace) && (
            <MenuButton
              icon={<Link />}
              label={IMPORT_FROM_GIT_LABEL}
              onClick={() => {
                closeMenu(true);
                onAction?.();
                onImportFromGit();
              }}
            />
          )}
        </Menu>
      )}
    </div>
  );
}
