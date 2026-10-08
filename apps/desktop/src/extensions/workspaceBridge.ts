/**
 * The seam between the running shell and non-React consumers of workspace state.
 *
 * The workspace root, the open tabs, and the loaded documents all live in
 * `DesktopShell`'s React state, but the extension host is a module singleton
 * created at import time. Rather than lift that state into a store — which
 * would be a large change to the shell for one consumer — the shell publishes a
 * small, explicit surface here while it is mounted.
 *
 * Value-import free, for the same reason as `bootstrapRef`: the extension host
 * is reachable from the registries the shell renders.
 */

/** What the mounted shell offers to non-React callers. */
export interface WorkspaceBridge {
  /** Current workspace root, or `null` when no workspace is open. */
  readonly rootPath: string | null;
  /** Opens a workspace-relative Markdown note in an editor tab. */
  readonly openNote: (relativePath: string) => void;
  /** Opens a tab of a contributed kind. */
  readonly openTab: (kind: string, title: string) => void;
}

let bridge: WorkspaceBridge | null = null;

/** Publishes the mounted shell's workspace surface. Only the shell calls this. */
export function setWorkspaceBridge(next: WorkspaceBridge | null): void {
  bridge = next;
}

/** Returns the mounted shell's workspace surface, or `null` before it mounts. */
export function getWorkspaceBridge(): WorkspaceBridge | null {
  return bridge;
}
