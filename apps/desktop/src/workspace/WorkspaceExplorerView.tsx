import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Folder, FolderGit2, FolderPlus, Link, MoreHorizontal } from "lucide-react";
import type { NativeWorkspaceEntry } from "../native/commands";
import type { WorkspaceExplorerState, WorkspaceTreeNode } from "./workspaceExplorerModel";
import { WorkspaceFileIcon } from "./WorkspaceFileIcon";
import { cn } from "../lib/utils";
import { Menu, MenuButton, MenuCheckbox } from "../shell/Menu";
import { WorkspaceTreeItem, InlineNameInput } from "./WorkspaceTree";
import { DeleteConfirmDialog, WorkspaceContextMenu } from "./WorkspaceExplorerMenus";
import { GitLinkImportDialog } from "./GitLinkImportDialog";
import { IMPORT_FROM_GIT_LABEL, OPEN_FOLDER_LABEL } from "./gitLinkImportCopy";
import { isWorkspaceGitLinked } from "./workspaceSettings";
import type { ContextMenuState, CreateState, RenameState, WorkspaceExplorerActions } from "./workspaceExplorerTypes";

interface WorkspaceExplorerViewProps {
  readonly className?: string;
  readonly state: WorkspaceExplorerState;
  readonly tree: readonly WorkspaceTreeNode[];
  readonly workspaceRootPath?: string;
  readonly contextMenu: ContextMenuState | null;
  readonly renaming: RenameState | null;
  readonly creating: CreateState | null;
  readonly pendingDelete: NativeWorkspaceEntry | null;
  readonly actionError: string | null;
  readonly busy: boolean;
  readonly showHidden: boolean;
  readonly moreMenuOpen: boolean;
  readonly expandedFolders: ReadonlySet<string>;
  readonly activePath: string | null;
  readonly recentWorkspacePaths: readonly string[];
  readonly actions: WorkspaceExplorerActions;
  readonly importFromGitOpen: boolean;
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
  actionError,
  busy,
  showHidden,
  moreMenuOpen,
  expandedFolders,
  activePath,
  recentWorkspacePaths,
  actions,
  importFromGitOpen
}: WorkspaceExplorerViewProps) {
  const isBusy = state.phase === "opening" || busy;
  // The menu has to know its own trigger, or the press that closes it counts
  // as an outside click first and it shuts and reopens in one gesture.
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <section className={cn("flex min-h-0 flex-1 flex-col text-sidebar-foreground bg-sidebar font-sans", className)} aria-label="Workspace explorer" aria-busy={isBusy}>
      <header className="flex min-h-16 items-center justify-between gap-3 px-3 py-2.5 border-b border-border">
        <div className="min-w-0">
          <p className="mb-0.5 text-muted-foreground text-[0.625rem] font-bold tracking-[0.08em] leading-none uppercase">Workspace</p>
          <h2 className="max-w-44 m-0 overflow-hidden text-[0.8125rem] font-[650] leading-tight truncate">{state.snapshot?.workspace.name ?? "No workspace open"}</h2>
        </div>
        <div className="relative">
          <button
            ref={moreButtonRef}
            type="button"
            className={cn(
              "flex flex-none items-center justify-center w-[1.6rem] h-[1.6rem] border-0 rounded-small text-muted-foreground bg-transparent cursor-pointer font-inherit focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 [&>svg]:stroke-current",
              "not-aria-disabled:hover:bg-[color-mix(in_srgb,var(--color-accent)_58%,transparent)]",
              moreMenuOpen && "text-sidebar-foreground"
            )}
            aria-label="More actions"
            aria-expanded={moreMenuOpen}
            disabled={state.phase !== "ready"}
            onClick={() => actions.setMoreMenuOpen((value) => !value)}
          >
            <MoreHorizontal aria-hidden="true" className="size-[0.95rem]" />
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
              <MenuButton
                label="New folder"
                onClick={() => { actions.setMoreMenuOpen(false); actions.startCreate("", "folder"); }}
              />
              <MenuButton
                label="New file"
                onClick={() => { actions.setMoreMenuOpen(false); actions.startCreate("", "file"); }}
              />
            </Menu>
          )}
        </div>
      </header>

      {actionError && state.phase !== "ready" && (
        <p className="m-0 px-3 py-[0.4rem] border-b border-[color-mix(in_srgb,var(--color-destructive)_45%,var(--color-border))] text-danger bg-[color-mix(in_srgb,var(--color-destructive)_9%,transparent)] text-[0.6875rem] leading-1.4" role="alert">{actionError}</p>
      )}
      {state.phase === "empty" && <EmptyState />}
      {state.phase === "opening" && <StatusState message="Reading workspace entries…" />}
      {state.phase === "error" && <ErrorState message={state.error ?? "The workspace could not be opened."} onDismiss={actions.dismissError} />}
      {state.phase === "ready" && (
        <div
          className="flex min-h-0 flex-1 flex-col"
          aria-label={`${state.snapshot?.workspace.name} explorer`}
          onContextMenu={(event) => actions.showContextMenu(event, { kind: "background" })}
        >
          <p className="m-0 overflow-hidden px-3 py-2 border-b border-border text-muted-foreground text-[0.6875rem] truncate" title={state.snapshot?.workspace.root_path}>
            {state.snapshot?.workspace.root_path}
          </p>
          {actionError && (
            <p className="m-0 px-3 py-[0.4rem] border-b border-[color-mix(in_srgb,var(--color-destructive)_45%,var(--color-border))] text-danger bg-[color-mix(in_srgb,var(--color-destructive)_9%,transparent)] text-[0.6875rem] leading-1.4" role="alert">{actionError}</p>
          )}
          {tree.length === 0 && !creating ? (
            <StatusState message="This workspace is empty. Right-click to create a new file or folder." />
          ) : (
            <ul
              className="min-h-0 flex-1 m-0 overflow-auto py-1.5 list-none [scrollbar-color:var(--color-border)_transparent] scrollbar-thin"
              role="tree"
              aria-label={`${state.snapshot?.workspace.name} files`}
              onKeyDown={actions.handleTreeKeyDown}
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
                  renaming={renaming}
                  creating={creating}
                  expandedFolders={expandedFolders}
                  actions={actions}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {contextMenu && (
        <WorkspaceContextMenu menu={contextMenu} actions={actions} />
      )}

      {pendingDelete && (
        <DeleteConfirmDialog
          entry={pendingDelete}
          onCancel={() => actions.setPendingDelete(null)}
          onConfirm={() => void actions.confirmDelete()}
        />
      )}
      <WorkspaceSelector
        currentPath={workspaceRootPath}
        paths={recentWorkspacePaths}
        onAdd={actions.openWorkspace}
        onImportFromGit={actions.openGitLinkImport}
        onSelect={actions.launchWorkspace}
      />
      {importFromGitOpen && <GitLinkImportDialog onClose={() => actions.setImportFromGitOpen(false)} />}
    </section>
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
      <button type="button" className="mt-2.5 border border-current rounded-small px-1.75 py-1 text-inherit cursor-pointer font-inherit text-[0.6875rem] hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)]" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

export function WorkspaceSelector({
  currentPath,
  paths,
  onSelect,
  onAdd,
  onImportFromGit
}: {
  readonly currentPath?: string;
  readonly paths: readonly string[];
  readonly onSelect: (path: string) => void;
  readonly onAdd: () => void;
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
  useEffect(() => {
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
  }, [optionsKey, options]);

  const currentIsGitLinked = currentPath ? gitLinkedPaths.has(currentPath) : false;
  const currentFolderName = currentPath?.split(/[\\/]/).at(-1) ?? "Choose workspace";

  return (
    <div className="relative mt-auto border-t border-border">
      <button
        ref={triggerRef}
        className="flex w-full min-w-0 items-center gap-[0.45rem] border-0 text-sidebar-foreground cursor-pointer font-inherit text-xs text-left px-3 py-[0.65rem] [&>svg]:w-[0.9rem] [&>svg]:h-[0.9rem] [&>svg]:stroke-current [&>svg:last-child]:ml-auto"
        type="button"
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={currentIsGitLinked ? `${currentFolderName} (Git-linked workspace)` : currentFolderName}
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
          className="absolute right-2 bottom-[calc(100%+0.35rem)] left-2 z-20"
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
                  onSelect(path);
                }}
              />
            );
          })}
          <MenuButton
            icon={<FolderPlus />}
            label={OPEN_FOLDER_LABEL}
            onClick={() => {
              closeMenu(true);
              onAdd();
            }}
          />
          <MenuButton
            icon={<Link />}
            label={IMPORT_FROM_GIT_LABEL}
            onClick={() => {
              closeMenu(true);
              onImportFromGit();
            }}
          />
        </Menu>
      )}
    </div>
  );
}
