import type { WorkspaceEntry } from "@thinkbrain/core";

/** A node in the explorer file tree consumed by react-arborist. */
export interface FileTreeNode {
  /** Stable unique id (folder paths are prefixed so they never collide). */
  readonly id: string;
  /** Display label: the final path segment. */
  readonly name: string;
  /** Workspace-relative path of the folder or file. */
  readonly path: string;
  readonly kind: "folder" | "file";
  /** True for Markdown files (editable); always false for folders. */
  readonly isMarkdown: boolean;
  /** Present only for files; carries the native entry for open/rename/delete. */
  readonly entry?: WorkspaceEntry;
  /** Present only for folders. react-arborist treats nodes without it as leaves. */
  readonly children?: FileTreeNode[];
}

interface FolderLevel {
  readonly children: FileTreeNode[];
  readonly folders: Map<string, FolderLevel>;
}

/**
 * Builds a nested folder/file tree from the full workspace entry list.
 *
 * Handles directories (so empty folders appear) and non-Markdown files, giving
 * the explorer a normal file-manager feel. Within every level, folders are
 * listed before files and each group is sorted case-insensitively.
 *
 * Args:
 *   entries: Folder and file entries from the workspace listing.
 *
 * Returns:
 *   The ordered, nested root nodes of the file tree.
 */
export function buildFileTree(
  entries: readonly WorkspaceEntry[]
): FileTreeNode[] {
  const root = createFolderLevel();

  for (const entry of entries) {
    const segments = entry.relativePath.split("/").filter(Boolean);

    if (segments.length === 0) {
      continue;
    }

    if (entry.kind === "directory") {
      ensureFolder(root, segments);
      continue;
    }

    const parent = ensureFolder(root, segments.slice(0, -1));
    parent.children.push({
      id: entry.relativePath,
      name: entry.name,
      path: entry.relativePath,
      kind: "file",
      isMarkdown: entry.isMarkdown,
      entry
    });
  }

  return sortNodes(root.children);
}

function createFolderLevel(): FolderLevel {
  return { children: [], folders: new Map() };
}

/**
 * Walks (creating as needed) the folder chain for the given path segments.
 *
 * Idempotent: a folder created here is reused whether it was reached via an
 * explicit directory entry or inferred from a nested file's path.
 */
function ensureFolder(root: FolderLevel, segments: string[]): FolderLevel {
  let current = root;
  let folderPath = "";

  for (const segment of segments) {
    folderPath = folderPath ? `${folderPath}/${segment}` : segment;

    let next = current.folders.get(segment);
    if (!next) {
      next = createFolderLevel();
      current.folders.set(segment, next);
      current.children.push({
        id: `folder:${folderPath}`,
        name: segment,
        path: folderPath,
        kind: "folder",
        isMarkdown: false,
        children: next.children
      });
    }

    current = next;
  }

  return current;
}

/** Recursively sorts a level: folders first, then files, each A→Z (case-insensitive). */
function sortNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  for (const node of nodes) {
    if (node.children) {
      sortNodes(node.children);
    }
  }

  nodes.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "folder" ? -1 : 1;
    }

    return left.name.localeCompare(right.name, undefined, {
      sensitivity: "base"
    });
  });

  return nodes;
}
