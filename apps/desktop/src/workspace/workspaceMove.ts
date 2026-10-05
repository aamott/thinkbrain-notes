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

/** Display name for a drop target's parent — `""` is the workspace root. */
export function destinationLabel(parentPath: string): string {
  if (!parentPath) return "workspace root";
  return parentPath.split("/").at(-1) ?? parentPath;
}

/**
 * The message for a refused drop on `parentPath`, for announcing while
 * hovering or on release. Only meaningful when `isInvalidWorkspaceMove` is
 * already true: same-parent drops read "already in" and anything else is the
 * own-subtree rule.
 */
export function invalidMoveMessage(
  source: Pick<NativeWorkspaceEntry, "name" | "parent_path">,
  parentPath: string
): string {
  return parentPath === source.parent_path
    ? `${source.name} is already in ${destinationLabel(parentPath)}.`
    : WORKSPACE_INVALID_MOVE_MESSAGE;
}

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

// ---- Drag-session effects shared by the pointer and HTML5 controllers ----

/** Hover time before a collapsed folder target expands. */
export const DRAG_AUTO_EXPAND_MS = 600;
const AUTOSCROLL_EDGE_PX = 28;
const AUTOSCROLL_STEP_PX = 14;

/** Scrolls `container` while the pointer sits within the edge band. */
export function edgeAutoScroll(container: HTMLElement | null, clientY: number): void {
  if (!container) return;
  const rect = container.getBoundingClientRect();
  if (clientY < rect.top + AUTOSCROLL_EDGE_PX) container.scrollTop -= AUTOSCROLL_STEP_PX;
  else if (clientY > rect.bottom - AUTOSCROLL_EDGE_PX) container.scrollTop += AUTOSCROLL_STEP_PX;
}

/**
 * Hover-expand bookkeeping for a drag controller: `update` arms the expand
 * timer when a valid collapsed folder is hovered; `clear` disarms it. Only
 * one drag session is live per hook, so the handle can live at hook level
 * rather than inside session state. The caller supplies the current handlers
 * on each update, so an armed timer never fires a stale prop.
 */
export function createAutoExpand(): {
  update: (
    path: string | null,
    valid: boolean,
    handlers: { isExpanded: (path: string) => boolean; expandFolder: (path: string) => void }
  ) => void;
  clear: () => void;
} {
  let target: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    target = null;
    timer = null;
  };
  const update = (
    path: string | null,
    valid: boolean,
    handlers: { isExpanded: (path: string) => boolean; expandFolder: (path: string) => void }
  ) => {
    const next = valid && path ? path : null;
    if (next === target) return;
    clear();
    if (next && !handlers.isExpanded(next)) {
      target = next;
      timer = setTimeout(() => {
        target = null;
        timer = null;
        handlers.expandFolder(next);
      }, DRAG_AUTO_EXPAND_MS);
    }
  };
  return { update, clear };
}

/**
 * The shared spine of a drag-and-drop move: announce, perform, announce the
 * outcome, and expand a non-root destination so the moved row stays visible.
 * Controllers add their own latching/focus work around this. Returns whether
 * the move succeeded.
 */
export async function runWorkspaceMove(
  source: NativeWorkspaceEntry,
  parentPath: string,
  moveEntry: (source: NativeWorkspaceEntry, parentPath: string) => Promise<boolean>,
  expandFolder: (path: string) => void,
  announce: (message: string) => void
): Promise<boolean> {
  const destination = workspaceMoveDestination(source, parentPath);
  announce(`Moving ${source.name} to ${destinationLabel(parentPath)}.`);
  const ok = await moveEntry(source, parentPath);
  if (!ok) {
    announce(`Could not move ${source.name}.`);
    return false;
  }
  announce(`Moved ${source.name} to ${destination}.`);
  if (parentPath) expandFolder(parentPath);
  return true;
}
