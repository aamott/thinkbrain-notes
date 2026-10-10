import type { NativeWorkspaceEntry, NativeWorkspaceSnapshot } from "../native/commands";
import { sortWorkspaceTree, type ExplorerSortOrder } from "./explorerSort";

export type ExplorerPhase = "empty" | "opening" | "ready" | "error";

export interface WorkspaceExplorerState {
  readonly phase: ExplorerPhase;
  readonly snapshot: NativeWorkspaceSnapshot | null;
  readonly entries: readonly NativeWorkspaceEntry[];
  readonly error: string | null;
}

export type WorkspaceExplorerAction =
  | { readonly type: "open" }
  | {
      readonly type: "opened";
      readonly snapshot: NativeWorkspaceSnapshot;
      readonly entries: readonly NativeWorkspaceEntry[];
    }
  | { readonly type: "failed"; readonly message: string }
  | { readonly type: "dismiss" };

export const initialWorkspaceExplorerState: WorkspaceExplorerState = {
  phase: "empty",
  snapshot: null,
  entries: [],
  error: null
};

export function workspaceExplorerReducer(
  state: WorkspaceExplorerState,
  action: WorkspaceExplorerAction
): WorkspaceExplorerState {
  switch (action.type) {
    case "open":
      return { ...state, phase: "opening", error: null };
    case "opened":
      return {
        phase: "ready",
        snapshot: action.snapshot,
        entries: action.entries,
        error: null
      };
    case "failed":
      return { ...initialWorkspaceExplorerState, phase: "error", error: action.message };
    case "dismiss":
      return initialWorkspaceExplorerState;
  }
}

export interface WorkspaceTreeNode {
  readonly entry: NativeWorkspaceEntry;
  readonly children: readonly WorkspaceTreeNode[];
}

/** Builds a stable folder-first tree from native workspace entries, ordered by `order`. */
export function buildWorkspaceTree(
  entries: readonly NativeWorkspaceEntry[],
  order: ExplorerSortOrder = "name-asc"
): readonly WorkspaceTreeNode[] {
  const nodes = new Map<string, { entry: NativeWorkspaceEntry; children: WorkspaceTreeNode[] }>();

  for (const entry of entries) {
    nodes.set(entry.relative_path, { entry, children: [] });
  }

  const roots: WorkspaceTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(node.entry.parent_path);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return sortWorkspaceTree(roots, order);
}

export function workspaceErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "The workspace could not be opened. Check that the folder is still available.";
}
