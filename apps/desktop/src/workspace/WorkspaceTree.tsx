import { memo, useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Folder, FolderOpen, GripVertical } from "lucide-react";
import type { WorkspaceTreeNode } from "./workspaceExplorerModel";
import { WorkspaceFileIcon } from "./WorkspaceFileIcon";
import { cn } from "../lib/utils";
import { isNewNoteCreate, type CreateState, type RenameState, type WorkspaceExplorerActions } from "./workspaceExplorerTypes";
import {
  WORKSPACE_DRAG_HANDLE_ATTR,
  WORKSPACE_DROP_PARENT_ATTR,
  WORKSPACE_TREE_ROW_ATTR,
  type WorkspaceTreeDrag
} from "./useWorkspaceTreeDrag";

// ---- Tree item ----

export const WorkspaceTreeItem = memo(function WorkspaceTreeItem({
  node,
  depth = 0,
  isFirst = false,
  activePath,
  renaming,
  creating,
  expandedFolders,
  actions,
  drag
}: {
  readonly node: WorkspaceTreeNode;
  readonly depth?: number;
  readonly isFirst?: boolean;
  readonly activePath: string | null;
  readonly renaming: RenameState | null;
  readonly creating: CreateState | null;
  readonly expandedFolders: ReadonlySet<string>;
  readonly actions: WorkspaceExplorerActions;
  /** Shared drag-and-drop controller from `WorkspaceExplorerView`. */
  readonly drag: WorkspaceTreeDrag | null;
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
  const isDragged = drag?.draggedPath === node.entry.relative_path;
  const isDropTarget = drag?.dropTargetPath === node.entry.relative_path;
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
        // The open/toggle button and the drag handle are siblings — a button
        // can never nest inside a button — inside one flex row that carries
        // the drop-target markers for the drag controller's elementFromPoint
        // resolution.
        <div
          className={cn(
            "group/row flex min-w-0 items-stretch",
            isDragged && "opacity-60",
            isDropTarget && (drag?.dropTargetValid
              ? "bg-[color-mix(in_srgb,var(--color-accent)_58%,transparent)]"
              : "bg-[color-mix(in_srgb,var(--color-destructive)_18%,transparent)]")
          )}
          {...{ [WORKSPACE_TREE_ROW_ATTR]: node.entry.relative_path }}
          {...(isDirectory ? { [WORKSPACE_DROP_PARENT_ATTR]: node.entry.relative_path } : {})}
          onContextMenu={(event) => {
            // An armed touch hold owns the browser contextmenu event; it opens
            // this same menu on release instead of stealing the drag gesture.
            if (drag?.onRowContextMenu(event, node.entry)) return;
            setActivePath(node.entry.relative_path);
            showContextMenu(event, { kind: isDirectory ? "folder" : "file", entry: node.entry });
          }}
        >
          <button
            ref={buttonRef}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 py-[0.265rem] pr-1 border-0 text-sidebar-foreground font-inherit text-xs leading-tight text-left aria-disabled:cursor-default not-aria-disabled:cursor-pointer not-aria-disabled:hover:bg-[color-mix(in_srgb,var(--color-accent)_58%,transparent)] not-aria-disabled:focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_58%,transparent)] focus-visible:outline-none pointer-coarse:min-h-11 pointer-coarse:py-1.5 pointer-coarse:text-sm",
              isHiddenEntry && "opacity-60"
            )}
            type="button"
            style={{ paddingLeft: `${0.75 + depth * 0.875}rem` }}
            aria-disabled={!isDirectory && !isFile ? true : undefined}
            tabIndex={isFocusable ? 0 : -1}
            onKeyDown={handleKeyDown}
            onPointerDown={(event) => drag?.onRowPointerDown(event, node.entry)}
            onTouchStart={(event) => drag?.onRowTouchStart(event, node.entry)}
            onClick={() => {
              // A completed drag ends in a pointerup on the row, which would
              // otherwise also fire this click and open/toggle the entry.
              if (drag?.consumeSuppressedClick()) return;
              setActivePath(node.entry.relative_path);
              if (isDirectory) toggleFolder(node.entry.relative_path);
              else if (isFile) handleFileSelected(node.entry.relative_path);
            }}
            aria-label={isDirectory ? `${isExpanded ? "Collapse" : "Expand"} ${node.entry.name}` : isFile ? `Open ${node.entry.name}` : undefined}
          >
            <span className="w-2.5 flex-none text-muted-foreground text-center [&>svg]:w-[0.9rem] [&>svg]:h-[0.9rem] [&>svg]:stroke-current" aria-hidden="true">{isDirectory ? (isExpanded ? <FolderOpen /> : <Folder />) : <WorkspaceFileIcon name={node.entry.name} />}</span>
            <span className="min-w-0 truncate">{node.entry.name}</span>
          </button>
          {drag && (
            <button
              type="button"
              {...{ [WORKSPACE_DRAG_HANDLE_ATTR]: node.entry.relative_path }}
              // `touch-none` keeps this handle out of the browser's scroll
              // gesture so a touch drag can start here while the rest of the
              // row scrolls normally. Subtle on a pointer-fine desktop, it is
              // always visible and >=44px on coarse pointers.
              className="flex w-5 flex-none cursor-grab touch-none items-center justify-center self-stretch border-0 bg-transparent p-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-70 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 pointer-coarse:w-11 pointer-coarse:min-h-11 pointer-coarse:opacity-70 [&>svg]:size-[0.8rem] [&>svg]:stroke-current"
              tabIndex={isFocusable ? 0 : -1}
              aria-label={`Move ${node.entry.name}. Press Enter to pick it up, use the arrow keys to choose a folder, Enter to drop, Escape to cancel.`}
              onPointerDown={(event) => drag.onHandlePointerDown(event, node.entry)}
              onKeyDown={(event) => drag.onHandleKeyDown(event, node.entry)}
            >
              <GripVertical aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {isDirectory && isExpanded && (
        <>
          {isCreatingHere && (
            <ul role="group" className="m-0 pl-3.5 list-none">
              <InlineNameInput
                key={creating!.focusRequest}
                depth={depth + 1}
                icon={creating!.kind === "folder" ? <Folder /> : <WorkspaceFileIcon name="" />}
                initialValue={isNewNoteCreate(creating!) ? ".md" : ""}
                caretBeforeExtension={isNewNoteCreate(creating!)}
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
                  drag={drag}
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
  caretBeforeExtension = false,
  wrapInListItem = false,
  disabled = false,
  error = null,
  onEdit,
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
  /** Places the caret before the final extension dot instead of at the end —
   *  so typing into a `.md` prefilled note name prepends the actual name. */
  readonly caretBeforeExtension?: boolean;
  readonly wrapInListItem?: boolean;
  readonly disabled?: boolean;
  /** Inline validation message; rendered under the input and cleared on edit. */
  readonly error?: string | null;
  readonly onEdit?: () => void;
  readonly onSubmit: (value: string) => Promise<boolean>;
  readonly onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  // Track whether the user committed via Enter so the blur handler does not
  // also fire onCancel. Without this, Enter -> submit -> blur -> cancel would
  // double-fire.
  const committedRef = useRef(false);

  useEffect(() => {
    const element = inputRef.current;
    element?.focus();
    if (selectOnFocus) element?.select();
    else if (caretBeforeExtension && element) {
      const dot = element.value.lastIndexOf(".");
      const caret = dot >= 0 ? dot : element.value.length;
      element.setSelectionRange(caret, caret);
    }
  }, [focusRequest, selectOnFocus, caretBeforeExtension]);

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
      <span className="min-w-0 flex-1">
        <input
          ref={inputRef}
          className="w-full min-w-0 border border-input rounded-small px-[0.3rem] py-0.5 text-foreground bg-background font-inherit text-xs focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1"
          value={value}
          disabled={disabled}
          // An in-flight submit must not disable the input: real engines blur a
          // disabled field, which would strand focus on <body> before any
          // confirm dialog can capture the element to restore focus to.
          readOnly={submitting}
          aria-busy={submitting || undefined}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setValue(event.target.value);
            onEdit?.();
          }}
          onKeyDown={handleKeyDown}
          // On blur without an explicit commit/cancel, treat as cancel so the
          // input does not linger when the user clicks elsewhere or opens a menu.
          onBlur={() => {
            if (committedRef.current) return;
            committedRef.current = true;
            onCancel();
          }}
        />
        {error && (
          <p id={errorId} role="alert" className="m-0 mt-1 text-danger text-[0.6875rem] leading-1.4">
            {error}
          </p>
        )}
      </span>
    </form>
  );

  return wrapInListItem ? <li className="m-0 p-0">{form}</li> : form;
}
