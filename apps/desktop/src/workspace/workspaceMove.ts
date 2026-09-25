/**
 * Pure helpers for drag-and-drop moves in the workspace explorer.
 *
 * The filesystem work stays inside `rename_workspace_entry`; these functions
 * decide where a drop lands, whether it is allowed, and which lifted explorer
 * paths (active row, expanded folders) follow the moved prefix. They share the
 * tree's convention: workspace-relative, `/`-separated paths and `""` for the
 * workspace root.
 */

import type { NativeWorkspaceEntry } from "../native/commands";

/** The friendly message for a folder dropped into itself or a subfolder. */
export const WORKSPACE_INVALID_MOVE_MESSAGE =
  "A folder cannot be moved into itself or one of its subfolders.";

/**
 * The relative path an entry would have inside `parentPath` ("" = workspace
 * root). Only the name moves; the entry keeps its leaf name.
 */
export function workspaceMoveDestination(
  source: Pick<NativeWorkspaceEntry, "name">,
  parentPath: string
): string {
  return parentPath ? `${parentPath}/${source.name}` : source.name;
}

/** Segment-aware prefix test: `a/b` is inside `a`, `ab` is not. */
function isSameOrDescendant(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Whether dropping `source` inside `parentPath` is a no-op or illegal.
 * Invalid means the target parent is the entry's current parent (nothing
 * would change) or — for a folder — the target is the folder itself or one of
 * its descendants, which cannot exist after the move.
 */
export function isInvalidWorkspaceMove(
  source: Pick<NativeWorkspaceEntry, "kind" | "relative_path" | "parent_path">,
  parentPath: string
): boolean {
  if (parentPath === source.parent_path) return true;
  if (source.kind !== "directory") return false;
  return isSameOrDescendant(parentPath, source.relative_path);
}

/**
 * Remaps `path` across a moved prefix: the moved entry itself and anything
 * beneath it move to `newPrefix`; every other path is returned unchanged.
 */
export function remapMovedPath(
  path: string | null,
  oldPrefix: string,
  newPrefix: string
): string | null {
  if (path === null || oldPrefix === newPrefix) return path;
  if (path === oldPrefix) return newPrefix;
  if (path.startsWith(`${oldPrefix}/`)) return `${newPrefix}${path.slice(oldPrefix.length)}`;
  return path;
}

/**
 * Remaps every expanded-folder path across a moved prefix so a moved folder
 * (and its expanded descendants) stays expanded at its new location.
 */
export function remapExpandedFolders(
  paths: ReadonlySet<string>,
  oldPrefix: string,
  newPrefix: string
): Set<string> {
  const next = new Set<string>();
  for (const path of paths) {
    next.add(remapMovedPath(path, oldPrefix, newPrefix) ?? path);
  }
  return next;
}
