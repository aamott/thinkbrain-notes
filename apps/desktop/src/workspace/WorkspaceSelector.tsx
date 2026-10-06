import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Folder, FolderGit2, FolderPlus, Link } from "lucide-react";
import type { NativeWorkspaceAccessCapabilities } from "../native/commands";
import { cn } from "../lib/utils";
import { Menu, MenuButton } from "../shell/Menu";
import { CREATE_MANAGED_WORKSPACE_LABEL, IMPORT_FROM_GIT_LABEL, OPEN_FOLDER_LABEL } from "./gitLinkImportCopy";
import { isWorkspaceGitLinked } from "./workspaceSettings";
import type { WorkspaceSelectorVariant } from "./WorkspaceSelectorPortalModel";

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
