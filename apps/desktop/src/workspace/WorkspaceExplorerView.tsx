import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, ChevronDown, Folder, FolderPlus, MoreHorizontal } from "lucide-react";
import type { NativeWorkspaceEntry } from "../native/commands";
import type { WorkspaceExplorerState, WorkspaceTreeNode } from "./workspaceExplorerModel";
import { WorkspaceFileIcon } from "./WorkspaceFileIcon";
import { cn } from "../lib/utils";
import { handleMenuKeyDown } from "../shell/menuKeyboard";
import { WorkspaceTreeItem, InlineNameInput } from "./WorkspaceTree";
import { DeleteConfirmDialog, WorkspaceContextMenu } from "./WorkspaceExplorerMenus";
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
  actions
}: WorkspaceExplorerViewProps) {
  const isBusy = state.phase === "opening" || busy;

  return (
    <section className={cn("flex min-h-0 flex-1 flex-col text-sidebar-foreground bg-sidebar font-sans", className)} aria-label="Workspace explorer" aria-busy={isBusy}>
      <header className="flex min-h-16 items-center justify-between gap-3 px-3 py-2.5 border-b border-border">
        <div className="min-w-0">
          <p className="mb-0.5 text-muted-foreground text-[0.625rem] font-bold tracking-[0.08em] leading-none uppercase">Workspace</p>
          <h2 className="max-w-44 m-0 overflow-hidden text-[0.8125rem] font-[650] leading-tight truncate">{state.snapshot?.workspace.name ?? "No workspace open"}</h2>
        </div>
        <div className="relative">
          <button
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
            <>
              {/* Click-away backdrop. */}
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default"
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => actions.setMoreMenuOpen(false)}
              />
              <div
                className="absolute right-0 top-full mt-1 z-50 min-w-44 border border-border rounded-small bg-popover py-1 text-popover-foreground shadow-soft"
                role="menu"
                aria-label="More actions"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    actions.setMoreMenuOpen(false);
                  }
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center justify-between gap-2 border-0 px-3 py-[0.4rem] cursor-pointer font-inherit text-xs text-left text-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  // The "show hidden" toggle keeps the menu open so the user
                  // can see the checkmark flip and the tree update beneath it.
                  onClick={() => void actions.toggleShowHidden()}
                >
                  <span>Show hidden files</span>
                  {showHidden && <Check className="size-3.5" aria-hidden="true" />}
                </button>
                <hr className="my-1 border-0 border-t border-border" />
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 border-0 px-3 py-[0.4rem] cursor-pointer font-inherit text-xs text-left text-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  onClick={() => { actions.setMoreMenuOpen(false); actions.startCreate("", "folder"); }}
                >
                  <span>New folder</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 border-0 px-3 py-[0.4rem] cursor-pointer font-inherit text-xs text-left text-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  onClick={() => { actions.setMoreMenuOpen(false); actions.startCreate("", "file"); }}
                >
                  <span>New file</span>
                </button>
              </div>
            </>
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
        onSelect={actions.launchWorkspace}
      />
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
        className="flex w-full min-w-0 items-center gap-[0.45rem] border-0 text-sidebar-foreground cursor-pointer font-inherit text-xs text-left px-3 py-[0.65rem] [&>svg]:w-[0.9rem] [&>svg]:h-[0.9rem] [&>svg]:stroke-current [&>svg:last-child]:ml-auto"
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
              className="flex w-full min-w-0 items-center gap-[0.45rem] border-0 text-sidebar-foreground cursor-pointer font-inherit text-xs text-left px-2 py-[0.45rem] rounded-small hover:bg-accent focus-visible:bg-accent focus-visible:outline-none [&>svg]:w-[0.9rem] [&>svg]:h-[0.9rem] [&>svg]:stroke-current"
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
            className="flex w-full min-w-0 items-center gap-[0.45rem] border-0 text-sidebar-foreground cursor-pointer font-inherit text-xs text-left px-2 py-[0.45rem] rounded-small hover:bg-accent focus-visible:bg-accent focus-visible:outline-none [&>svg]:w-[0.9rem] [&>svg]:h-[0.9rem] [&>svg]:stroke-current"
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
