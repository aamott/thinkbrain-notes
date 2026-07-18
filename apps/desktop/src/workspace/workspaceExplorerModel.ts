import type { NativeWorkspaceEntry, NativeWorkspaceSnapshot } from "../native/commands";

export type ExplorerPhase = "empty" | "picking" | "opening" | "ready" | "cancelled" | "error";

export interface WorkspaceExplorerState {
  readonly phase: ExplorerPhase;
  readonly snapshot: NativeWorkspaceSnapshot | null;
  readonly entries: readonly NativeWorkspaceEntry[];
  readonly error: string | null;
}

export type WorkspaceExplorerAction =
  | { readonly type: "pick" }
  | { readonly type: "cancel" }
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
    case "pick":
      return { ...state, phase: "picking", error: null };
    case "cancel":
      return { ...state, phase: "cancelled", error: null };
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

/** Builds a stable folder-first tree from native workspace entries. */
export function buildWorkspaceTree(
  entries: readonly NativeWorkspaceEntry[]
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

  const sortNodes = (items: WorkspaceTreeNode[]): void => {
    items.sort((left, right) => {
      if (left.entry.kind !== right.entry.kind) {
        return left.entry.kind === "directory" ? -1 : 1;
      }
      return left.entry.name.localeCompare(right.entry.name, undefined, { sensitivity: "base" });
    });
    items.forEach((item) => sortNodes(item.children as WorkspaceTreeNode[]));
  };

  sortNodes(roots);
  return roots;
}

export function workspaceErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "The workspace could not be opened. Check that the folder is still available.";
}
