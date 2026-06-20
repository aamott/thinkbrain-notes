import { useEffect } from "react";

import { normalizeNativeError } from "../native/commands";
import { useAppStore } from "../stores/appStore";
import { IndexCancelledError, indexWorkspace } from "./searchService";

/**
 * Kicks off a background (re)index whenever a workspace is opened.
 *
 * Keyed on the workspace root path so it rebuilds the cache on open/switch but
 * not on every in-place file-list mutation (saves/renames/deletes update the
 * index incrementally instead). The run is abortable so switching workspaces
 * cancels an in-flight index. Indexing never blocks the editor — files are read
 * and pushed in batches that yield to the event loop.
 */
export function useWorkspaceIndexer(): void {
  const rootPath = useAppStore((state) =>
    state.workspace.status === "ready" ? state.workspace.workspace.rootPath : null
  );

  useEffect(() => {
    if (!rootPath) {
      return;
    }

    const workspace = useAppStore.getState().workspace;
    if (workspace.status !== "ready") {
      return;
    }

    const controller = new AbortController();
    const { startIndexing, setIndexingProgress, finishIndexing, setIndexingError } =
      useAppStore.getState();

    startIndexing(workspace.files.length);

    indexWorkspace(rootPath, workspace.files, {
      signal: controller.signal,
      onProgress: ({ indexed, total }) => {
        if (!controller.signal.aborted) {
          setIndexingProgress(indexed, total);
        }
      }
    })
      .then((indexed) => {
        if (!controller.signal.aborted) {
          finishIndexing(indexed);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof IndexCancelledError || controller.signal.aborted) {
          return;
        }

        setIndexingError(normalizeNativeError(error));
      });

    return () => {
      controller.abort();
    };
  }, [rootPath]);
}
