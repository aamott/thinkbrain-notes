import { useCallback, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { WorkspaceTreeNode } from "./workspaceExplorerModel";
import { visibleWorkspacePaths } from "./workspaceExplorerTypes";

/** Folder expansion and the active row, with arrow/Home/End movement between visible rows. */
export function useWorkspaceTreeNavigation(tree: readonly WorkspaceTreeNode[]) {
  const [expandedFolders, setExpandedFolders] = useState<ReadonlySet<string>>(new Set());

  const expandFolder = useCallback((relativePath: string) => {
    setExpandedFolders((current) => current.has(relativePath) ? current : new Set(current).add(relativePath));
  }, []);
  const toggleFolder = useCallback((relativePath: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  }, []);
  const collapseFolder = useCallback((relativePath: string) => {
    setExpandedFolders((current) => {
      if (!current.has(relativePath)) return current;
      const next = new Set(current);
      next.delete(relativePath);
      return next;
    });
  }, []);

  const [activePath, setActivePath] = useState<string | null>(null);

  const visiblePaths = useMemo(() => visibleWorkspacePaths(tree, expandedFolders), [tree, expandedFolders]);

  const handleTreeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLUListElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (visiblePaths.length === 0) return;
      const currentPath = activePath ?? visiblePaths[0];
      if (!currentPath) return;
      const currentIndex = visiblePaths.indexOf(currentPath);
      if (currentIndex === -1) return;

      if (event.key === "ArrowDown") {
        const nextIndex = Math.min(currentIndex + 1, visiblePaths.length - 1);
        const nextPath = visiblePaths[nextIndex];
        if (nextPath) setActivePath(nextPath);
      } else {
        const prevIndex = Math.max(currentIndex - 1, 0);
        const prevPath = visiblePaths[prevIndex];
        if (prevPath) setActivePath(prevPath);
      }
    } else if (event.key === "Home") {
      event.preventDefault();
      const firstPath = visiblePaths[0];
      if (firstPath) setActivePath(firstPath);
    } else if (event.key === "End") {
      event.preventDefault();
      const lastPath = visiblePaths[visiblePaths.length - 1];
      if (lastPath) setActivePath(lastPath);
    }
  }, [visiblePaths, activePath]);

  return {
    expandedFolders,
    setExpandedFolders,
    activePath,
    setActivePath,
    expandFolder,
    toggleFolder,
    collapseFolder,
    handleTreeKeyDown
  };
}
