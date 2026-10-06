import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { NativeWorkspaceEntry } from "../native/commands";
import { copyFilesToClipboard } from "../native/clipboard";
import { usePlatformCapabilities } from "../native/platformCapabilities";
import { Menu, MenuButton, MenuSeparator } from "../shell/Menu";
import type { ContextMenuState, WorkspaceExplorerActions } from "./workspaceExplorerTypes";

// ---- Context menu ----

/**
 * What right-clicking in the file tree offers.
 *
 * Only the items live here. Where the menu sits, how it stays on screen, which
 * item takes focus and what closes it are one behaviour shared with every other
 * menu in the app — see `shell/Menu`.
 */
export function WorkspaceContextMenu({ menu, actions, rootPath }: {
  readonly menu: ContextMenuState;
  readonly actions: WorkspaceExplorerActions;
  /** Workspace root for absolute-path copies; null until a snapshot lands. */
  readonly rootPath: string | null;
}) {
  const { closeContextMenu, startCreate, startRename, requestDelete, showVersions, refreshEntries, openWorkspace } = actions;
  const canCopyFiles = usePlatformCapabilities((state) => state.capabilities.canCopyFilesToClipboard);
  const target = menu.target;
  // Create actions target the folder itself (for folders) or the parent (for files).
  const createParentPath = target.kind === "folder" ? target.entry.relative_path : target.kind === "file" ? target.entry.parent_path : "";
  // Absolute path feeds the system-clipboard file copy, which file managers
  // need to know which file to carry. `/` joins fine even on Windows.
  const absolutePath = target.kind !== "background" && rootPath
    ? `${rootPath}/${target.entry.relative_path}`
    : null;

  const copyText = (text: string) => {
    void navigator.clipboard?.writeText(text)?.catch((error) => {
      console.error("[explorer] Could not copy to the clipboard.", error);
    });
    closeContextMenu();
  };

  return (
    <Menu at={menu} onClose={closeContextMenu} label="Workspace actions">
      {/* Creates lead every target — they describe where a new entry would
          land (the folder itself, the file's parent, or the root), not what
          happens to the right-clicked one. */}
      <MenuButton label="New file" onClick={() => startCreate(createParentPath, "file")} />
      <MenuButton label="New folder" onClick={() => startCreate(createParentPath, "folder")} />
      <MenuSeparator />
      {target.kind !== "background" && (
        <>
          <MenuButton label="Rename" onClick={() => startRename(target.entry)} />
          {target.kind === "file" && <MenuButton label="Previous versions…" onClick={() => showVersions(target.entry)} />}
          <MenuButton label="Copy name" onClick={() => copyText(target.entry.name)} />
          <MenuButton label="Copy relative path" onClick={() => copyText(target.entry.relative_path)} />
          {absolutePath && <MenuButton label="Copy absolute path" onClick={() => copyText(absolutePath)} />}
          {absolutePath && canCopyFiles && (
            <MenuButton
              label={target.kind === "folder" ? "Copy folder" : "Copy file"}
              onClick={() => { void copyFilesToClipboard([absolutePath]); closeContextMenu(); }}
            />
          )}
          <MenuButton label="Delete" danger onClick={() => requestDelete(target.entry)} />
          <MenuSeparator />
        </>
      )}
      <MenuButton label="Refresh" onClick={() => { void refreshEntries(); closeContextMenu(); }} />
      <MenuButton label="Open workspace…" onClick={() => { void openWorkspace(); closeContextMenu(); }} />
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
