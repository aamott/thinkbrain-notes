import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import type { NativeWorkspaceEntry } from "../native/commands";
import { cn } from "../lib/utils";
import { handleMenuKeyDown } from "../shell/menuKeyboard";
import type { ContextMenuState } from "./workspaceExplorerTypes";

// ---- Context menu ----

export function WorkspaceContextMenu({ menu, onClose, onStartCreate, onStartRename, onRequestDelete, onRefresh, onOpenWorkspace }: {
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
      className="fixed z-20 min-w-44 border border-border rounded-small bg-popover shadow-soft py-1 text-xs"
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
        "flex w-full items-center gap-2 border-0 px-3 py-[0.4rem] cursor-pointer font-inherit text-xs text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
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

export function DeleteConfirmDialog({ entry, onCancel, onConfirm }: {
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
        <p id={descriptionId} className="m-0 text-muted-foreground text-[0.8rem] leading-1.45">
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
