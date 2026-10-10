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

import type { Disposable } from "@thinkbrain/core";

/** What the mounted shell offers to non-React callers. */
export interface WorkspaceBridge {
  /** Current workspace root, or `null` when no workspace is open. */
  readonly rootPath: string | null;
  /** Opens a workspace-relative Markdown note in an editor tab. */
  readonly openNote: (relativePath: string) => void;
  /** Opens a tab of a contributed kind. */
  readonly openTab: (kind: string, title: string) => void;
}

type BridgeListener = (bridge: WorkspaceBridge | null) => void;

let bridge: WorkspaceBridge | null = null;
const listeners = new Set<BridgeListener>();

/** Publishes the mounted shell's workspace surface. Only the shell calls this. */
export function setWorkspaceBridge(next: WorkspaceBridge | null): void {
  const rootChanged = next?.rootPath !== bridge?.rootPath;
  bridge = next;
  // Listeners fire only on a root change — the bridge is republished whenever
  // the shell's callback identities move, and a relist keyed on object
  // identity would churn the folder on every unrelated render.
  if (rootChanged) {
    for (const listener of listeners) listener(next);
  }
}

/**
 * Fires synchronously inside {@link setWorkspaceBridge} when the workspace
 * root changes, so a listener reading {@link getWorkspaceBridge} already sees
 * the new surface — unlike an effect, which can run before the shell's
 * republish in the same commit.
 */
export function subscribeWorkspaceBridge(listener: BridgeListener): Disposable {
  listeners.add(listener);
  return {
    dispose: () => {
      listeners.delete(listener);
    }
  };
}

/** Returns the mounted shell's workspace surface, or `null` before it mounts. */
export function getWorkspaceBridge(): WorkspaceBridge | null {
  return bridge;
}
