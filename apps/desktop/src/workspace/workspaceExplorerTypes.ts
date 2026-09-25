import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, SetStateAction } from "react";
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

/**
 * Everything the explorer can be asked to do.
 *
 * One object rather than two dozen props. All of these are owned by
 * `WorkspaceExplorer` and consumed by its view, its tree or its menus, and
 * naming each one at every level meant a new action was four files of plumbing
 * before it did anything at all.
 *
 * `WorkspaceExplorer` memoizes it, which is what keeps `WorkspaceTreeItem`'s
 * own memoization worth having: a fresh object every render would re-render
 * every row of the tree on every keystroke.
 */
export interface WorkspaceExplorerActions {
  readonly setActivePath: (path: string) => void;
  readonly toggleShowHidden: () => Promise<void>;
  readonly startCreate: (parentPath: string, kind: "file" | "folder") => void;
  readonly submitCreate: (target: CreateState, name: string) => Promise<boolean>;
  readonly submitRename: (target: RenameState, name: string) => Promise<boolean>;
  readonly handleTreeKeyDown: (event: ReactKeyboardEvent<HTMLUListElement>) => void;
  readonly handleFileSelected: (relativePath: string) => void;
  readonly showContextMenu: (event: ReactMouseEvent, target: ContextMenuTarget) => void;
  readonly closeContextMenu: () => void;
  readonly toggleFolder: (relativePath: string) => void;
  readonly collapseFolder: (relativePath: string) => void;
  readonly expandFolder: (relativePath: string) => void;
  /**
   * Moves `source` into `destinationParentPath` ("" = workspace root) through
   * the native rename path. Resolves `true` when the move happened or was a
   * no-op; `false` when it was rejected or failed.
   */
  readonly moveEntry: (source: NativeWorkspaceEntry, destinationParentPath: string) => Promise<boolean>;
  readonly startRename: (entry: NativeWorkspaceEntry) => void;
  readonly requestDelete: (entry: NativeWorkspaceEntry) => void;
  /** Lists one file's earlier versions, in the history panel. */
  readonly showVersions: (entry: NativeWorkspaceEntry) => void;
  readonly refreshEntries: () => Promise<void>;
  readonly createManagedWorkspace: (name: string) => Promise<boolean>;
  readonly openWorkspace: () => Promise<void>;
  readonly openGitLinkImport: () => void;
  readonly launchWorkspace: (rootPath: string) => Promise<void>;
  readonly confirmDelete: () => Promise<void>;
  /** Clears the inline create-field error as the draft is edited. */
  readonly setInlineCreateError: (value: string | null) => void;
  /** Safe close for the non-Markdown confirmation: back to the inline draft. */
  readonly dismissExtensionConfirm: () => void;
  /** Runs the saved non-Markdown file create once, after confirmation. */
  readonly confirmExtensionCreate: () => Promise<void>;
  readonly setMoreMenuOpen: Dispatch<SetStateAction<boolean>>;
  readonly setRenaming: (value: RenameState | null) => void;
  readonly setCreating: (value: CreateState | null) => void;
  readonly setPendingDelete: (value: NativeWorkspaceEntry | null) => void;
  readonly setCreateManagedWorkspaceOpen: Dispatch<SetStateAction<boolean>>;
  readonly setImportFromGitOpen: Dispatch<SetStateAction<boolean>>;
  readonly setManagedStorageNoticeOpen: Dispatch<SetStateAction<boolean>>;
  readonly dismissError: () => void;
}

// State shapes used by the explorer for inline editing.
export interface RenameState {
  readonly entry: NativeWorkspaceEntry;
  readonly focusRequest: number;
}

/**
 * Inline-create state. File creation records whether it came from the
 * canonical New note command or a generic New file action, because only the
 * note flow pre-fills `.md` and warns before producing a non-Markdown file.
 */
export interface FolderCreateState {
  readonly parentPath: string;
  readonly kind: "folder";
  readonly focusRequest: number;
}

export interface NewFileCreateState {
  readonly parentPath: string;
  readonly kind: "file";
  readonly source: "new-file";
  readonly focusRequest: number;
}

export interface NewNoteCreateState {
  readonly parentPath: string;
  readonly kind: "file";
  readonly source: "new-note";
  readonly focusRequest: number;
}

export type CreateState = FolderCreateState | NewFileCreateState | NewNoteCreateState;

export function isNewNoteCreate(target: CreateState): target is NewNoteCreateState {
  return target.kind === "file" && target.source === "new-note";
}

/**
 * A New note submission whose name is valid but lacks a Markdown ending. The
 * draft is kept while the extension confirmation dialog decides whether the
 * plain create path may run.
 */
export interface PendingExtensionConfirm {
  readonly target: NewNoteCreateState;
  readonly name: string;
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
