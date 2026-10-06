import { useCallback, useEffect, useMemo, useRef } from "react";
import { File, FilePlus, FolderOpen, FolderPlus, MoreHorizontal, RefreshCw } from "lucide-react";
import type { NativeWorkspaceEntry } from "../native/commands";
import type { WorkspaceExplorerState, WorkspaceTreeNode } from "./workspaceExplorerModel";
import { cn } from "../lib/utils";
import { Menu, MenuButton, MenuCheckbox, MenuSeparator } from "../shell/Menu";
import { WorkspaceTreeItem, CreateNameInput } from "./WorkspaceTree";
import { DeleteConfirmDialog, WorkspaceContextMenu } from "./WorkspaceExplorerMenus";
import { CreateFileTypeConfirmDialog } from "./CreateFileTypeConfirmDialog";
import { useWorkspaceSelectorOutlet } from "./WorkspaceSelectorPortalModel";
import { WorkspaceSwitching, WorkspaceSwitchingSelector } from "./WorkspaceSwitching";
import type { WorkspaceSwitchingController } from "./useWorkspaceSwitching";
import { type ContextMenuState, type CreateState, type PendingExtensionConfirm, type RenameState, type WorkspaceExplorerActions } from "./workspaceExplorerTypes";
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
  readonly actions: WorkspaceExplorerActions;
  readonly switching: WorkspaceSwitchingController;
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
  actions,
  switching,
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

  // The same banner under the header while opening, or atop the tree surface
  // once ready — the two sites never render at once.
  const errorBanner = actionError && (
    <p className="m-0 px-3 py-[0.4rem] border-b border-[color-mix(in_srgb,var(--color-destructive)_45%,var(--color-border))] text-danger bg-[color-mix(in_srgb,var(--color-destructive)_9%,transparent)] text-[0.6875rem] leading-1.4" role="alert">{actionError}</p>
  );

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
            <WorkspaceSwitchingSelector switching={switching} currentPath={workspaceRootPath} variant="panel" />
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
                <MenuSeparator />
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

      {state.phase !== "ready" && errorBanner}
      {state.phase === "empty" && (
        switching.accessCapabilities
          ? <EmptyState managed={switching.accessCapabilities.canCreateManagedWorkspace} />
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
          {errorBanner}
          {tree.length === 0 && !creating ? (
            <StatusState message="This workspace is empty. Right-click to create a new file or folder." />
          ) : (
            <ul
              ref={treeScrollRef}
              data-phone-scroll-clearance
              className="tn-scrollbar-left min-h-0 flex-1 m-0 overflow-auto py-1.5 list-none [scrollbar-color:var(--color-border)_transparent] scrollbar-thin"
              role="tree"
              aria-label={`${state.snapshot?.workspace.name} files`}
              onKeyDown={actions.handleTreeKeyDown}
            >
              {creating && creating.parentPath === "" && (
                <CreateNameInput
                  creating={creating}
                  depth={0}
                  disabled={busy}
                  error={inlineCreateError}
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
                  busy={busy}
                  inlineCreateError={inlineCreateError}
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
      <WorkspaceSwitching switching={switching} currentPath={workspaceRootPath} busy={busy} error={actionError} />
    </section>
  );
}

// ---- Helpers and small presentational components ----

// Shared chrome-row action button: 26px on fine pointers, grows to a
// touch-friendly 36px on coarse ones.
const HEADER_ACTION_CLASSES = cn(
  "flex flex-none items-center justify-center size-[1.6rem] border-0 rounded-small text-muted-foreground bg-transparent cursor-pointer font-inherit",
  "focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 [&>svg]:stroke-current [&>svg]:size-[0.95rem]",
  "hover:bg-[color-mix(in_srgb,var(--color-accent)_58%,transparent)]",
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

