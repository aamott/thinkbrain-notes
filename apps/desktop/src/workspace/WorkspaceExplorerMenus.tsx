import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import type { NativeWorkspaceEntry } from "../native/commands";
import { Menu, MenuButton } from "../shell/Menu";
import type { ContextMenuState, WorkspaceExplorerActions } from "./workspaceExplorerTypes";

// ---- Context menu ----

/**
 * What right-clicking in the file tree offers.
 *
 * Only the items live here. Where the menu sits, how it stays on screen, which
 * item takes focus and what closes it are one behaviour shared with every other
 * menu in the app — see `shell/Menu`.
 */
export function WorkspaceContextMenu({ menu, actions }: {
  readonly menu: ContextMenuState;
  readonly actions: WorkspaceExplorerActions;
}) {
  const { closeContextMenu, startCreate, startRename, requestDelete, showVersions, refreshEntries, openWorkspace } = actions;
  const target = menu.target;
  // Create actions target the folder itself (for folders) or the parent (for files).
  const createParentPath = target.kind === "folder" ? target.entry.relative_path : target.kind === "file" ? target.entry.parent_path : "";

  const handle = (action: () => void) => (event: ReactMouseEvent) => {
    event.stopPropagation();
    action();
  };

  return (
    <Menu at={menu} onClose={closeContextMenu} label="Workspace actions">
      {target.kind === "folder" && <MenuButton label="New file" onClick={handle(() => startCreate(createParentPath, "file"))} />}
      {target.kind === "folder" && <MenuButton label="New folder" onClick={handle(() => startCreate(createParentPath, "folder"))} />}
      {target.kind === "background" && <MenuButton label="New file" onClick={handle(() => startCreate("", "file"))} />}
      {target.kind === "background" && <MenuButton label="New folder" onClick={handle(() => startCreate("", "folder"))} />}
      {target.kind !== "background" && <hr className="my-1 border-0 border-t border-border" />}
      {target.kind !== "background" && <MenuButton label="Rename" onClick={handle(() => startRename(target.entry))} />}
      {target.kind === "file" && <MenuButton label="Previous versions…" onClick={handle(() => showVersions(target.entry))} />}
      {target.kind !== "background" && <MenuButton label="Delete" danger onClick={handle(() => requestDelete(target.entry))} />}
      {target.kind === "background" && <hr className="my-1 border-0 border-t border-border" />}
      {target.kind === "background" && <MenuButton label="Refresh" onClick={handle(() => { void refreshEntries(); closeContextMenu(); })} />}
      {target.kind === "background" && <MenuButton label="Open workspace…" onClick={handle(() => { void openWorkspace(); closeContextMenu(); })} />}
    </Menu>
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
