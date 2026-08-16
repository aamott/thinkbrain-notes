import type { NativeWorkspaceEntry } from "../native/commands";
import type { WorkspaceTreeNode } from "./workspaceExplorerModel";

export type ContextMenuTarget =
  | { readonly kind: "background" }
  | { readonly kind: "file" | "folder"; readonly entry: NativeWorkspaceEntry };

export interface ContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly target: ContextMenuTarget;
}

// State shapes used by the explorer for inline editing.
export interface RenameState {
  readonly entry: NativeWorkspaceEntry;
  readonly focusRequest: number;
}

export interface CreateState {
  readonly parentPath: string;
  readonly kind: "file" | "folder";
  readonly focusRequest: number;
}

/** Joins a parent path and a name into a workspace-relative path. */
export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

/** Reports whether a name has a Markdown extension (case-insensitive). */
export function isMarkdownName(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

/**
 * Validates an inline rename/create name. Path separators are rejected so the
 * user cannot accidentally create nested directories by typing `sub/note.md`
 * in the name field; the backend would otherwise accept each segment.
 */
export function isValidName(name: string): boolean {
  return !/[\\/]/.test(name);
}

/**
 * Validates an inline folder create path. Forward-slash-separated nested
 * paths (e.g. `a/b/c`) are allowed so the backend's `create_dir_all` can
 * build intermediate directories. Backslashes and empty/`.`/`..` segments
 * are rejected to keep paths workspace-relative and predictable.
 */
export function isValidFolderPath(name: string): boolean {
  if (name.includes("\\")) return false;
  const segments = name.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") return false;
  }
  return true;
}

export function visibleWorkspacePaths(
  tree: readonly WorkspaceTreeNode[],
  expandedFolders: ReadonlySet<string>
): string[] {
  const paths: string[] = [];
  const traverse = (nodes: readonly WorkspaceTreeNode[]) => {
    for (const node of nodes) {
      paths.push(node.entry.relative_path);
      if (node.entry.kind === "directory" && expandedFolders.has(node.entry.relative_path)) {
        traverse(node.children);
      }
    }
  };
  traverse(tree);
  return paths;
}
