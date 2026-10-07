import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { ContextMenuState, ContextMenuTarget } from "./workspaceExplorerTypes";

/** The explorer's right-click / touch-hold menu position and target. */
export function useWorkspaceContextMenu() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const showContextMenuAt = useCallback((x: number, y: number, target: ContextMenuTarget) => {
    setContextMenu({ x, y, target });
  }, []);

  const showContextMenu = useCallback((event: ReactMouseEvent, target: ContextMenuTarget) => {
    event.preventDefault();
    event.stopPropagation();
    showContextMenuAt(event.clientX, event.clientY, target);
  }, [showContextMenuAt]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Only the resize. Clicking elsewhere and pressing Escape are the menu's own
  // business now — see `shell/Menu` — but a menu pinned to where the pointer
  // was has nothing to stay pinned to once the window changes shape.
  useEffect(() => {
    if (!contextMenu) return;
    const onResize = () => setContextMenu(null);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [contextMenu]);

  return { contextMenu, setContextMenu, showContextMenu, showContextMenuAt, closeContextMenu };
}
