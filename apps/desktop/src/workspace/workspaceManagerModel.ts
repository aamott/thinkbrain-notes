import type { NativeKnownWorkspace } from "../native/commands";

/**
 * Pure decisions for one row of the workspace manager — which badge it wears,
 * whether its Open button works, and which trailing removal it carries.
 */
export interface WorkspaceRowState {
  readonly canOpen: boolean;
  /** `open_elsewhere` rows still open — their action focuses that window. */
  readonly badge: "current" | "missing" | "open_elsewhere" | null;
  /** `forget` removes the entry from recents; `delete` permanently deletes a managed vault. */
  readonly removal: "forget" | "delete" | null;
}

/**
 * What a listed workspace may do right now.
 *
 * The workspace already open in this window can be neither opened nor removed
 * (removing it would orphan live state). A missing folder cannot be opened but
 * can always be forgotten — for a managed vault that is the only sensible
 * removal too, since there is nothing left to delete. Otherwise external
 * entries get "forget" and managed vaults get "delete". A root another window
 * already shows wears "open_elsewhere" — its Open becomes Focus.
 */
export function workspaceRowState(
  entry: NativeKnownWorkspace,
  currentPath: string | null | undefined,
  openElsewhere?: readonly string[]
): WorkspaceRowState {
  if (entry.rootPath === currentPath) {
    return { canOpen: false, badge: "current", removal: null };
  }
  if (entry.missing) {
    return { canOpen: false, badge: "missing", removal: "forget" };
  }
  return {
    canOpen: true,
    badge: openElsewhere?.includes(entry.rootPath) ? "open_elsewhere" : null,
    removal: entry.kind === "managed" ? "delete" : "forget"
  };
}

/** Case-insensitive filter over a workspace's display name and its full path. */
export function filterWorkspaces(
  entries: readonly NativeKnownWorkspace[],
  query: string
): NativeKnownWorkspace[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...entries];
  return entries.filter(
    (entry) =>
      entry.name.toLowerCase().includes(needle) ||
      entry.rootPath.toLowerCase().includes(needle)
  );
}
