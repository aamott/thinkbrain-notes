/**
 * The subscriptions that keep the search/wiki-link indexes and the shell's
 * file list level with the workspace on disk.
 *
 * Split out of {@link useWorkspaceLifecycle}, which calls this hook after its
 * bridge and settings effects so these subscriptions run in the same order
 * they did before the split.
 */

import { isTauri } from "@tauri-apps/api/core";
import { useEffect, type Dispatch, type SetStateAction } from "react";
import { subscribeToNoteChanges } from "../events/noteChangeSubscription";
import type { NativeMarkdownFileEntry } from "../native/commands";
import { useSearchIndexStore } from "../search/searchIndexStore";
import { useWikiLinkIndexStore } from "../wikiLinks/wikiLinkIndexStore";
import { workspaceDesktopApi } from "../workspace/workspaceAdapter";
import { watchWorkspace } from "../workspace/workspaceWatcher";
import { addWorkspaceFile, removeWorkspaceFile } from "./workspaceFileList";

interface UseWorkspaceIndexesOptions {
  readonly restoredWorkspacePath: string | null;
  readonly setWorkspaceFiles: Dispatch<SetStateAction<readonly NativeMarkdownFileEntry[]>>;
}

export function useWorkspaceIndexes({
  restoredWorkspacePath,
  setWorkspaceFiles
}: UseWorkspaceIndexesOptions): void {
  // Subscribe both index caches to note mutation events for incremental
  // updates. The stores' actions are workspace-scoped, so events from other
  // windows are ignored.
  useEffect(() => subscribeWorkspaceStores(), []);

  // Index the restored workspace for search and wiki-links even when the
  // explorer panel is closed. Without this, `indexWorkspace` is only called
  // from `handleWorkspaceOpened`, which fires via the WorkspaceExplorer's mount
  // effect — so closing the explorer before restart leaves both indexes empty.
  // The store's `rootPath` guard prevents double-indexing when the explorer is
  // also open and has already triggered `handleWorkspaceOpened`.
  useEffect(() => {
    if (!isTauri() || !restoredWorkspacePath) return;
    const rootPath = restoredWorkspacePath;
    const { rootPath: wikiRoot } = useWikiLinkIndexStore.getState();
    if (wikiRoot === rootPath) return;
    // Switching workspaces while this read is in flight must not index the old
    // one over the new. `indexWorkspace` stamps its own root before checking
    // anything, so its internal guards cannot reject a stale caller — the
    // caller has to not call. Without this, a late listing for the previous
    // vault leaves both indexes holding its notes under its root, and every
    // later note event for the current vault is dropped by the root guards.
    let cancelled = false;
    void workspaceDesktopApi.openWorkspace(rootPath).then((snapshot) => {
      if (cancelled) return;
      // The explorer may have indexed this same workspace in the meantime.
      if (useWikiLinkIndexStore.getState().rootPath === rootPath) return;
      indexWorkspaceStores(rootPath, snapshot.files);
    });
    return () => {
      cancelled = true;
    };
  }, [restoredWorkspacePath]);

  // Watch the open workspace for edits the app did not make. Both indexes and
  // the calendar are caches of this folder, and until now only in-app writes
  // refreshed them — a `git pull`, a sync client or another editor left them
  // confidently wrong until the workspace was reopened. The watcher republishes
  // outside changes as the same `note.*` events an in-app edit produces, so
  // every consumer stays as it was.
  useEffect(() => {
    if (!isTauri() || !restoredWorkspacePath) return;
    const rootPath = restoredWorkspacePath;
    let cancelled = false;
    let stop: (() => void) | null = null;

    // A change the watcher cannot name path by path — a deleted folder takes
    // its notes with it and the OS reports only the folder — so the caches are
    // rebuilt from what is actually on disk.
    const rebuildFromDisk = () => {
      void workspaceDesktopApi.openWorkspace(rootPath).then((snapshot) => {
        if (cancelled) return;
        setWorkspaceFiles(snapshot.files);
        indexWorkspaceStores(rootPath, snapshot.files);
      });
    };

    void watchWorkspace(rootPath, rebuildFromDisk)
      .then((dispose) => {
        // The workspace can close while the watch is being set up.
        if (cancelled) {
          dispose();
          return;
        }
        stop = dispose;
      })
      .catch((error: unknown) => {
        // Watching is an enhancement over the previous behaviour, not a
        // prerequisite for it. Failing to watch costs freshness, so say so
        // rather than leaving the user to wonder why edits are not showing up.
        console.warn(
          "[watcher] Edits made outside the app will not be picked up automatically.",
          error
        );
      });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [restoredWorkspacePath, setWorkspaceFiles]);

  // Keep the shell's file list level with the folder. The indexes hear about
  // notes through their own subscriptions, but this list is separate state and
  // backs the command palette — so without this an externally created note is
  // searchable yet unopenable from the palette, and a deleted one stays listed.
  // Both in-app and outside changes arrive here, since they are the same events.
  useEffect(() => {
    if (!restoredWorkspacePath) return;
    const rootPath = restoredWorkspacePath;

    return subscribeToNoteChanges(
      () => rootPath,
      (change) => {
        switch (change.kind) {
          case "created":
            setWorkspaceFiles((files) => addWorkspaceFile(files, change.relativePath));
            break;
          case "deleted":
            setWorkspaceFiles((files) => removeWorkspaceFile(files, change.relativePath));
            break;
          case "renamed":
            setWorkspaceFiles((files) =>
              addWorkspaceFile(
                removeWorkspaceFile(files, change.oldRelativePath),
                change.newRelativePath
              )
            );
            break;
          case "saved":
            // The list holds names, and a save does not change one.
            break;
        }
      }
    );
  }, [restoredWorkspacePath, setWorkspaceFiles]);
}

/**
 * The workspace's two index caches — the search index and the wiki-link
 * index — are always indexed, cleared and subscribed together, so the
 * pairing lives here rather than at every call site.
 */
export function indexWorkspaceStores(rootPath: string, files: readonly NativeMarkdownFileEntry[]): void {
  void useSearchIndexStore.getState().indexWorkspace(rootPath, files);
  void useWikiLinkIndexStore.getState().indexWorkspace(rootPath, files);
}

/** Clears both workspace index caches. See {@link indexWorkspaceStores}. */
export function clearWorkspaceStores(): void {
  useSearchIndexStore.getState().clearWorkspace();
  useWikiLinkIndexStore.getState().clearWorkspace();
}

/**
 * Subscribes both workspace index caches to note mutation events for
 * incremental updates; returns the combined unsubscribe.
 */
function subscribeWorkspaceStores(): () => void {
  const unsubscribeSearch = useSearchIndexStore.getState().subscribeToEvents();
  const unsubscribeWikiLinks = useWikiLinkIndexStore.getState().subscribeToEvents();
  return () => {
    unsubscribeSearch();
    unsubscribeWikiLinks();
  };
}
