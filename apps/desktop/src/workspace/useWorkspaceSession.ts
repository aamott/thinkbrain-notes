import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import type { NativeMarkdownFileEntry, NativeWorkspaceSnapshot } from "../native/commands";
import { DEFAULT_EXPLORER_SORT, type ExplorerSortOrder } from "./explorerSort";
import type { WorkspaceDesktopApi } from "./workspaceAdapter";
import {
  initialWorkspaceExplorerState,
  workspaceErrorMessage,
  workspaceExplorerReducer
} from "./workspaceExplorerModel";
import type { WorkspaceSession } from "./workspaceSession";
import { DEFAULT_WORKSPACE_SETTINGS, readWorkspaceSettings } from "./workspaceSettings";

export interface UseWorkspaceSessionOptions {
  readonly api: WorkspaceDesktopApi;
  /** After a root finished opening — the shell indexes it and remembers it. */
  readonly onOpened?: (rootPath: string, snapshot: NativeWorkspaceSnapshot) => void;
  /** After a root failed to open: the window no longer has a workspace. */
  readonly onUnavailable?: (rootPath: string) => void;
}

/**
 * Owns the window's workspace session — the one authority for which root is
 * open. Opening runs here whether or not the explorer is mounted: the
 * per-workspace view settings first (the listing depends on `showHidden`),
 * then the snapshot, then the entry listing.
 *
 * Every step checks the root token after its `await`, so the last `open` wins
 * and an open, listing or failure for a root the window has left is dropped.
 * Any failure gives the root up, the same for a startup restore and an
 * in-window switch.
 */
export function useWorkspaceSession({
  api,
  onOpened,
  onUnavailable
}: UseWorkspaceSessionOptions): WorkspaceSession {
  const [state, dispatch] = useReducer(workspaceExplorerReducer, initialWorkspaceExplorerState);
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [files, setFiles] = useState<readonly NativeMarkdownFileEntry[]>([]);
  const [showHidden, setShowHiddenState] = useState(DEFAULT_WORKSPACE_SETTINGS.showHidden);
  const [explorerSort, setExplorerSort] = useState<ExplorerSortOrder>(DEFAULT_EXPLORER_SORT);
  const rootRef = useRef<string | null>(null);
  const showHiddenRef = useRef(showHidden);
  // The latest inputs, read after each `await`. Updated in an effect per the
  // react-hooks/refs rule.
  const latest = useRef({ api, onOpened, onUnavailable });
  useEffect(() => {
    latest.current = { api, onOpened, onUnavailable };
  });

  const setShowHidden = useCallback((next: boolean) => {
    showHiddenRef.current = next;
    setShowHiddenState(next);
  }, []);

  const open = useCallback(async (next: string) => {
    // A different root starts from the defaults until its own settings load.
    if (rootRef.current !== next) {
      setShowHidden(DEFAULT_WORKSPACE_SETTINGS.showHidden);
      setExplorerSort(DEFAULT_EXPLORER_SORT);
    }
    rootRef.current = next;
    setRootPath(next);
    dispatch({ type: "open" });
    try {
      // A failed settings read falls back to defaults rather than blocking
      // the workspace from opening.
      try {
        const settings = await readWorkspaceSettings(next);
        if (rootRef.current !== next) return;
        setShowHidden(settings.showHidden);
        // Mocked or older settings documents may carry no order at all.
        setExplorerSort(settings.explorerSort ?? DEFAULT_EXPLORER_SORT);
      } catch {
        if (rootRef.current !== next) return;
      }
      const snapshot = await latest.current.api.openWorkspace(next);
      if (rootRef.current !== next) return;
      const entries = await latest.current.api.listWorkspaceEntries(next, showHiddenRef.current);
      if (rootRef.current !== next) return;
      dispatch({ type: "opened", snapshot, entries });
      setFiles(snapshot.files);
      latest.current.onOpened?.(next, snapshot);
    } catch (error) {
      if (rootRef.current !== next) return;
      dispatch({ type: "failed", message: workspaceErrorMessage(error) });
      rootRef.current = null;
      setRootPath(null);
      setFiles([]);
      latest.current.onUnavailable?.(next);
    }
  }, [setShowHidden]);

  const refreshEntries = useCallback(async (root: string): Promise<boolean> => {
    const entries = await latest.current.api.listWorkspaceEntries(root, showHiddenRef.current);
    if (rootRef.current !== root) return false;
    dispatch({ type: "listed", entries });
    return true;
  }, []);

  const dismissError = useCallback(() => dispatch({ type: "dismiss" }), []);

  return useMemo(
    () => ({
      ...state,
      rootPath,
      rootRef,
      files,
      setFiles,
      showHidden,
      explorerSort,
      open,
      refreshEntries,
      setShowHidden,
      setExplorerSort,
      dismissError
    }),
    [state, rootPath, files, showHidden, explorerSort, open, refreshEntries, setShowHidden, dismissError]
  );
}
