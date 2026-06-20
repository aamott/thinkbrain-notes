import type { MarkdownFileEntry } from "@thinkbrain/core";

/** A node in the explorer file tree consumed by react-arborist. */
export interface FileTreeNode {
  /** Stable unique id (folder path prefixed so it never collides with files). */
  readonly id: string;
  /** Display label: the final path segment. */
  readonly name: string;
  /** Workspace-relative path of the folder or file. */
  readonly path: string;
  readonly kind: "folder" | "file";
  /** Present only for files; carries the native entry for open/rename/delete. */
  readonly file?: MarkdownFileEntry;
  /** Present only for folders. react-arborist treats nodes without it as leaves. */
  readonly children?: FileTreeNode[];
}

interface MutableFolder {
  readonly node: FileTreeNode;
  readonly children: FileTreeNode[];
  readonly folders: Map<string, MutableFolder>;
}

/**
 * Builds a nested folder/file tree from the flat workspace file list.
 *
 * Folders are inferred from each file's relative path segments, so no backend
 * directory data is required. Within every level, folders are listed before
 * files and each group is sorted case-insensitively for a stable, VS Code-like
 * ordering.
 *
 * Args:
 *   files: Flat Markdown file entries from the workspace snapshot.
 *
 * Returns:
 *   The ordered, nested root nodes of the file tree.
 */
export function buildFileTree(
  files: readonly MarkdownFileEntry[]
): FileTreeNode[] {
  const rootChildren: FileTreeNode[] = [];
  const rootFolders = new Map<string, MutableFolder>();

  for (const file of files) {
    const segments = file.relativePath.split("/").filter(Boolean);

    if (segments.length === 0) {
      continue;
    }

    // Walk (creating as needed) the folder chain that leads to this file.
    const folderSegments = segments.slice(0, -1);
    let currentChildren = rootChildren;
    let currentFolders = rootFolders;
    let folderPath = "";

    for (const segment of folderSegments) {
      folderPath = folderPath ? `${folderPath}/${segment}` : segment;

      let folder = currentFolders.get(segment);
      if (!folder) {
        const children: FileTreeNode[] = [];
        folder = {
          node: {
            id: `folder:${folderPath}`,
            name: segment,
            path: folderPath,
            kind: "folder",
            children
          },
          children,
          folders: new Map()
        };
        currentFolders.set(segment, folder);
        currentChildren.push(folder.node);
      }

      currentChildren = folder.children;
      currentFolders = folder.folders;
    }

    currentChildren.push({
      id: file.relativePath,
      name: file.fileName,
      path: file.relativePath,
      kind: "file",
      file
    });
  }

  return sortNodes(rootChildren);
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
