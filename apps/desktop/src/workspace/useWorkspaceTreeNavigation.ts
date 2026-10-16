import { useCallback, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { WorkspaceTreeNode } from "./workspaceExplorerModel";
import { visibleWorkspacePaths } from "./workspaceExplorerTypes";

/**
 * Folder expansion, the active row, and the tree's whole keyboard contract:
 * ArrowUp/Down/Home/End move between visible rows at list level, while
 * `handleRowKeyDown` owns the row-level keys — ArrowRight expands a folder or
 * steps into it, ArrowLeft collapses or steps out to the parent, Enter/Space
 * toggles a folder or opens a file.
 */
export function useWorkspaceTreeNavigation(
  tree: readonly WorkspaceTreeNode[],
  onFileSelected: (relativePath: string) => void
) {
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
      const currentIndex = activePath === null ? 0 : visiblePaths.indexOf(activePath);
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

  const handleRowKeyDown = useCallback((event: ReactKeyboardEvent, node: WorkspaceTreeNode) => {
    const isDirectory = node.entry.kind === "directory";
    const isExpanded = expandedFolders.has(node.entry.relative_path);
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        event.stopPropagation();
        if (isDirectory) {
          if (!isExpanded) {
            toggleFolder(node.entry.relative_path);
          } else {
            const firstChild = node.children[0];
            if (firstChild) setActivePath(firstChild.entry.relative_path);
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
        } else if (node.entry.kind === "file") {
          onFileSelected(node.entry.relative_path);
        }
        break;
    }
  }, [expandedFolders, onFileSelected, toggleFolder, collapseFolder]);

  return {
    expandedFolders,
    setExpandedFolders,
    activePath,
    setActivePath,
    expandFolder,
    toggleFolder,
    collapseFolder,
    handleTreeKeyDown,
    handleRowKeyDown
  };
}
