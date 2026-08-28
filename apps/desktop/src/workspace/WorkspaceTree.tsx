import { memo, useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Folder, FolderOpen } from "lucide-react";
import type { WorkspaceTreeNode } from "./workspaceExplorerModel";
import { WorkspaceFileIcon } from "./WorkspaceFileIcon";
import { cn } from "../lib/utils";
import type { CreateState, RenameState, WorkspaceExplorerActions } from "./workspaceExplorerTypes";

// ---- Tree item ----

export const WorkspaceTreeItem = memo(function WorkspaceTreeItem({
  node,
  depth = 0,
  isFirst = false,
  activePath,
  renaming,
  creating,
  expandedFolders,
  actions
}: {
  readonly node: WorkspaceTreeNode;
  readonly depth?: number;
  readonly isFirst?: boolean;
  readonly activePath: string | null;
  readonly renaming: RenameState | null;
  readonly creating: CreateState | null;
  readonly expandedFolders: ReadonlySet<string>;
  readonly actions: WorkspaceExplorerActions;
}) {
  const {
    setActivePath,
    handleFileSelected,
    showContextMenu,
    toggleFolder,
    collapseFolder,
    submitRename,
    submitCreate,
    setRenaming,
    setCreating
  } = actions;
  const isDirectory = node.entry.kind === "directory";
  const isFile = node.entry.kind === "file";
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
            toggleFolder(node.entry.relative_path);
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
          collapseFolder(node.entry.relative_path);
        } else if (node.entry.parent_path) {
          setActivePath(node.entry.parent_path);
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        event.stopPropagation();
        if (isDirectory) {
          toggleFolder(node.entry.relative_path);
        } else if (isFile) {
          handleFileSelected(node.entry.relative_path);
        }
        break;
    }
  }, [isDirectory, isExpanded, isFile, node, toggleFolder, collapseFolder, setActivePath, handleFileSelected]);

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
          onSubmit={(name) => submitRename(renaming!, name)}
          onCancel={() => setRenaming(null)}
        />
      ) : (
        <button
          ref={buttonRef}
          className={cn(
            "flex w-full min-w-0 items-center gap-1.5 py-[0.265rem] pr-3 border-0 text-sidebar-foreground font-inherit text-xs leading-tight text-left aria-disabled:cursor-default not-aria-disabled:cursor-pointer not-aria-disabled:hover:bg-[color-mix(in_srgb,var(--color-accent)_58%,transparent)] not-aria-disabled:focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_58%,transparent)] focus-visible:outline-none pointer-coarse:min-h-11 pointer-coarse:py-1.5 pointer-coarse:text-sm",
            isHiddenEntry && "opacity-60"
          )}
          type="button"
          style={{ paddingLeft: `${0.75 + depth * 0.875}rem` }}
          aria-disabled={!isDirectory && !isFile ? true : undefined}
          tabIndex={isFocusable ? 0 : -1}
          onKeyDown={handleKeyDown}
          onClick={() => {
            setActivePath(node.entry.relative_path);
            if (isDirectory) toggleFolder(node.entry.relative_path);
            else if (isFile) handleFileSelected(node.entry.relative_path);
          }}
          onContextMenu={(event) => {
            setActivePath(node.entry.relative_path);
            showContextMenu(event, { kind: isDirectory ? "folder" : "file", entry: node.entry });
          }}
          aria-label={isDirectory ? `${isExpanded ? "Collapse" : "Expand"} ${node.entry.name}` : isFile ? `Open ${node.entry.name}` : undefined}
        >
          <span className="w-2.5 flex-none text-muted-foreground text-center [&>svg]:w-[0.9rem] [&>svg]:h-[0.9rem] [&>svg]:stroke-current" aria-hidden="true">{isDirectory ? (isExpanded ? <FolderOpen /> : <Folder />) : <WorkspaceFileIcon name={node.entry.name} />}</span>
          <span className="min-w-0 truncate">{node.entry.name}</span>
        </button>
      )}
      {isDirectory && isExpanded && (
        <>
          {isCreatingHere && (
            <ul role="group" className="m-0 pl-3.5 list-none">
              <InlineNameInput
                depth={depth + 1}
                icon={creating!.kind === "folder" ? <Folder /> : <WorkspaceFileIcon name="" />}
                placeholder={creating!.kind === "folder" ? "New folder name…" : "New file name…"}
                ariaLabel={creating!.kind === "folder" ? "New folder name" : "New file name"}
                focusRequest={creating!.focusRequest}
                wrapInListItem
                onSubmit={(name) => submitCreate(creating!, name)}
                onCancel={() => setCreating(null)}
              />
            </ul>
          )}
          {node.children.length > 0 && (
            <ul role="group" className="m-0 pl-3.5 list-none">
              {node.children.map((child) => (
                <WorkspaceTreeItem
                  key={child.entry.relative_path}
                  node={child}
                  depth={depth + 1}
                  isFirst={false}
                  activePath={activePath}
                  renaming={renaming}
                  creating={creating}
                  expandedFolders={expandedFolders}
                  actions={actions}
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
export function InlineNameInput({
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
      <span className="w-2.5 flex-none text-muted-foreground text-center [&>svg]:w-[0.9rem] [&>svg]:h-[0.9rem] [&>svg]:stroke-current" aria-hidden="true">{icon}</span>
      <input
        ref={inputRef}
        className="min-w-0 flex-1 border border-input rounded-small px-[0.3rem] py-0.5 text-foreground bg-background font-inherit text-xs focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1"
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
