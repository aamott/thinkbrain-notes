import type { WorkspaceTreeNode } from "./workspaceExplorerModel";

/**
 * Explorer ordering, kept pure so every rule is testable without a DOM.
 *
 * Folders always precede files within a level regardless of order — that is
 * what keeps a tree readable as a tree. Everything else is per-order.
 */
export type ExplorerSortOrder =
  | "modified-desc"
  | "name-asc"
  | "name-desc"
  | "created-desc"
  | "created-asc"
  | "type";

/** The issue's preferred default: what you touched most recently, first. */
export const DEFAULT_EXPLORER_SORT: ExplorerSortOrder = "modified-desc";

export const EXPLORER_SORT_OPTIONS: readonly { id: ExplorerSortOrder; label: string }[] = [
  { id: "modified-desc", label: "Recently modified" },
  { id: "name-asc", label: "Name (A–Z)" },
  { id: "name-desc", label: "Name (Z–A)" },
  { id: "created-desc", label: "Recently created" },
  { id: "created-asc", label: "Oldest first" },
  { id: "type", label: "Type" }
];

const ORDER_IDS = new Set<string>(EXPLORER_SORT_OPTIONS.map((option) => option.id));

export function isExplorerSortOrder(value: unknown): value is ExplorerSortOrder {
  return typeof value === "string" && ORDER_IDS.has(value);
}

/** Case-insensitive, number-aware name compare; paths settle exact ties. */
const compareName = (left: WorkspaceTreeNode, right: WorkspaceTreeNode): number =>
  left.entry.name.localeCompare(right.entry.name, undefined, {
    sensitivity: "base",
    numeric: true
  }) || left.entry.relative_path.localeCompare(right.entry.relative_path);

/** Lowercase extension of a file name; a leading dot never counts as one. */
const extensionOf = (name: string): string | null => {
  const stem = name.startsWith(".") ? name.slice(1) : name;
  const dot = stem.lastIndexOf(".");
  return dot >= 0 ? stem.slice(dot + 1).toLowerCase() : null;
};

/**
 * A folder's timestamp is the newest (descending orders) or oldest
 * (ascending) timestamp among its descendant files — sorting a folder by its
 * own inode mtime would ignore what happened inside it. A folder with no
 * timed descendants falls back to its own entry time.
 */
const folderTime = (
  node: WorkspaceTreeNode,
  field: "updated_at" | "created_at",
  descending: boolean
): number | undefined => {
  let best: number | undefined;
  const visit = (current: WorkspaceTreeNode): void => {
    if (current.entry.kind === "file") {
      const value = current.entry[field];
      if (value != null && (best === undefined || (descending ? value > best : value < best))) best = value;
      return;
    }
    for (const child of current.children) visit(child);
  };
  visit(node);
  return best ?? node.entry[field] ?? undefined;
};

/**
 * Returns the tree re-sorted by `order` — new arrays and new node objects,
 * the input tree untouched.
 */
export function sortWorkspaceTree(
  nodes: readonly WorkspaceTreeNode[],
  order: ExplorerSortOrder
): readonly WorkspaceTreeNode[] {
  const timeField = order === "created-desc" || order === "created-asc" ? "created_at" : "updated_at";
  const descending = order !== "created-asc";
  // Memoized per call: a folder's time walks its whole subtree, and the sort
  // asks for it on every comparison.
  const times = new Map<string, number | undefined>();
  const timeOf = (node: WorkspaceTreeNode): number | undefined => {
    if (node.entry.kind === "file") return node.entry[timeField] ?? undefined;
    if (!times.has(node.entry.relative_path)) {
      times.set(node.entry.relative_path, folderTime(node, timeField, descending));
    }
    return times.get(node.entry.relative_path);
  };

  const compare = (left: WorkspaceTreeNode, right: WorkspaceTreeNode): number => {
    if (left.entry.kind !== right.entry.kind) {
      return left.entry.kind === "directory" ? -1 : 1;
    }
    switch (order) {
      case "name-asc":
        return compareName(left, right);
      case "name-desc":
        return compareName(right, left);
      case "type": {
        if (left.entry.kind === "directory") return compareName(left, right);
        const leftExt = extensionOf(left.entry.name);
        const rightExt = extensionOf(right.entry.name);
        if (leftExt === null && rightExt === null) return compareName(left, right);
        if (leftExt === null) return 1;
        if (rightExt === null) return -1;
        return leftExt.localeCompare(rightExt) || compareName(left, right);
      }
      default: {
        const leftTime = timeOf(left);
        const rightTime = timeOf(right);
        // Untimed entries trail timed ones; between themselves, name order.
        if (leftTime === undefined && rightTime === undefined) return compareName(left, right);
        if (leftTime === undefined) return 1;
        if (rightTime === undefined) return -1;
        if (leftTime !== rightTime) return descending ? rightTime - leftTime : leftTime - rightTime;
        return compareName(left, right);
      }
    }
  };

  const sortLevel = (items: readonly WorkspaceTreeNode[]): WorkspaceTreeNode[] =>
    items
      .map((node) => ({ ...node, children: sortLevel(node.children) }))
      .sort(compare);

  return sortLevel(nodes);
}
