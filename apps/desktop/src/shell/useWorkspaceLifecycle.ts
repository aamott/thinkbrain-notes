import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { subscribeToNoteChanges } from "../events/noteChangeSubscription";
import { setWorkspaceBridge } from "../extensions/workspaceBridge";
import { createDebounced, type Debounced } from "../lib/debounce";
import type { NativeMarkdownFileEntry, NativeWorkspaceSnapshot } from "../native/commands";
import {
  clampPanelWidth,
  DEFAULT_DESKTOP_STATE,
  DEFAULT_LEFT_PANEL_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
  loadDesktopState,
  promoteRecentWorkspace,
  saveDesktopState,
  type DesktopStateUpdate,
  type PersistedTab
} from "../settings/desktopState";
import { useSearchIndexStore } from "../search/searchIndexStore";
import { useSettingsStore } from "../settings/settingsStore";
import {
  createEditorTab,
  createStaticTab,
  type DesktopTab,
  type DesktopTabAction,
  type DesktopTabState
} from "../tabs/tabModel";
import { desktopTabRegistry } from "../tabs/tabRegistry";
import { useWikiLinkIndexStore } from "../wikiLinks/wikiLinkIndexStore";
import { workspaceDesktopApi } from "../workspace/workspaceAdapter";
import { watchWorkspace } from "../workspace/workspaceWatcher";
import { addWorkspaceFile, removeWorkspaceFile } from "./workspaceFileList";
import type { BottomPanel, LeftPanel } from "./shellTypes";
type PanelSide = "left" | "right";
/** How long a burst of tab opens and closes settles before it is written down. */
const TAB_PERSIST_DELAY_MS = 400;
/** How long a drag settles before its final width is written down. */
const PANEL_WIDTH_PERSIST_DELAY_MS = 300;
interface UseWorkspaceLifecycleOptions {
  readonly tabState: DesktopTabState;
  readonly dispatchTabs: Dispatch<DesktopTabAction>;
  readonly loadDocumentIntoView: (tabId: string, rootPath: string, relativePath: string) => void;
  readonly openMarkdownDocument: (rootPath: string, relativePath: string) => void;
}
export function useWorkspaceLifecycle({
  tabState,
  dispatchTabs,
  loadDocumentIntoView,
  openMarkdownDocument
}: UseWorkspaceLifecycleOptions) {
  const [leftPanel, setLeftPanel] = useState<LeftPanel | null>("explorer");
  const [bottomPanel, setBottomPanel] = useState<BottomPanel | null>(null);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_PANEL_WIDTH);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH);
  const leftWidthRef = useRef(leftWidth);
  const rightWidthRef = useRef(rightWidth);
  const [restoredWorkspacePath, setRestoredWorkspacePath] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<readonly NativeMarkdownFileEntry[]>([]);
  const [recentWorkspacePaths, setRecentWorkspacePaths] = useState<readonly string[]>([]);
  const recentWorkspacePathsRef = useRef<readonly string[]>([]);
  const [newNoteFocusRequest, setNewNoteFocusRequest] = useState(0);
  const [stateRestored, setStateRestored] = useState(!isTauri());
  const tabsRestoredRef = useRef(false);
  const updateRecentWorkspacePaths = useCallback((rootPath: string): readonly string[] => {
    const next = promoteRecentWorkspace(recentWorkspacePathsRef.current, rootPath);
    recentWorkspacePathsRef.current = next;
    setRecentWorkspacePaths(next);
    return next;
  }, []);

  // Restore the persisted desktop state (last workspace, recents, explorer
  // visibility) plus the workspace root the native window was launched with.
  useEffect(() => {
    if (!isTauri()) return;

    let active = true;
    void Promise.allSettled([loadDesktopState(), workspaceDesktopApi.windowWorkspaceRoot()]).then(([desktopResult, rootResult]) => {
      if (!active) return;
      const desktopState = desktopResult.status === "fulfilled" ? desktopResult.value : DEFAULT_DESKTOP_STATE;
      const windowRoot = rootResult.status === "fulfilled" ? rootResult.value : null;
      const recentPaths = windowRoot
        ? promoteRecentWorkspace(desktopState.recentWorkspacePaths, windowRoot)
        : desktopState.recentWorkspacePaths;
      setRestoredWorkspacePath(windowRoot ?? desktopState.lastWorkspacePath);
      recentWorkspacePathsRef.current = recentPaths;
      setRecentWorkspacePaths(recentPaths);
      setLeftPanel(desktopState.explorerOpen ? "explorer" : null);
      leftWidthRef.current = desktopState.leftPanelWidth;
      rightWidthRef.current = desktopState.rightPanelWidth;
      setLeftWidth(desktopState.leftPanelWidth);
      setRightWidth(desktopState.rightPanelWidth);
      setBottomPanel(desktopState.bottomPanelOpen ? "terminal" : null);

      // Restore persisted tabs once. Guarded by a ref because StrictMode
      // double-mounts effects in dev — without this, tabs would open twice.
      if (!tabsRestoredRef.current && desktopState.openTabs.length > 0) {
        tabsRestoredRef.current = true;
        const rootPath = windowRoot ?? desktopState.lastWorkspacePath;
        for (const persisted of desktopState.openTabs) {
          const tab = restoreTab(persisted, rootPath);
          if (tab) {
            dispatchTabs({ type: "open", tab });
            if (tab.kind === "editor" && tab.resource?.rootPath && tab.resource?.relativePath) {
              loadDocumentIntoView(tab.id, tab.resource.rootPath, tab.resource.relativePath);
            }
          }
        }
        if (desktopState.activeTabId) {
          dispatchTabs({ type: "activate", tabId: desktopState.activeTabId });
        }
      }
    }).finally(() => {
      if (active) setStateRestored(true);
    });

    return () => {
      active = false;
    };
  }, [dispatchTabs, loadDocumentIntoView]);

  // Other windows can append to the recent workspace list, so refresh it
  // whenever this window regains focus.
  useEffect(() => {
    if (!isTauri()) return;

    let active = true;
    const refreshRecentWorkspacePaths = () => {
      void loadDesktopState().then((desktopState) => {
        if (!active) return;
        recentWorkspacePathsRef.current = desktopState.recentWorkspacePaths;
        setRecentWorkspacePaths(desktopState.recentWorkspacePaths);
      }).catch(() => undefined);
    };

    window.addEventListener("focus", refreshRecentWorkspacePaths);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshRecentWorkspacePaths);
    };
  }, []);

  const persistDesktopState = useCallback((update: DesktopStateUpdate) => {
    if (!isTauri()) return;
    void saveDesktopState(update).catch(() => undefined);
  }, []);

  /**
   * Debounced tab persistence: writes the open tab list and active tab id
   * whenever tabs change, coalescing rapid open/close bursts into one write.
   * Skipped until state restoration completes so restored tabs don't
   * immediately trigger a redundant save.
   */
  const saveTabs = useMemo(
    () =>
      createDebounced<DesktopTabState>((tabs) => {
        persistDesktopState({
          openTabs: tabs.tabs.map(tabToPersisted),
          activeTabId: tabs.activeTabId
        });
      }, TAB_PERSIST_DELAY_MS),
    [persistDesktopState]
  );
  useEffect(() => {
    if (!stateRestored || !isTauri()) return;
    saveTabs(tabState);
  }, [saveTabs, stateRestored, tabState]);

  /**
   * Coalesces rapid resize updates so a drag writes its final width once rather
   * than rewriting the app-settings file for every pointer movement.
   */
  const savePanelWidth = useMemo(
    (): Record<PanelSide, Debounced<number>> => ({
      left: createDebounced<number>(
        (width) => persistDesktopState({ leftPanelWidth: width }),
        PANEL_WIDTH_PERSIST_DELAY_MS
      ),
      right: createDebounced<number>(
        (width) => persistDesktopState({ rightPanelWidth: width }),
        PANEL_WIDTH_PERSIST_DELAY_MS
      )
    }),
    [persistDesktopState]
  );
  const schedulePanelWidthPersistence = useCallback(
    (side: PanelSide, width: number) => savePanelWidth[side](width),
    [savePanelWidth]
  );

  /** Applies and schedules persistence for a safe dock width. */
  const updatePanelWidth = useCallback((side: PanelSide, requestedWidth: number) => {
    const width = clampPanelWidth(requestedWidth);
    if (side === "left") {
      leftWidthRef.current = width;
      setLeftWidth(width);
    } else {
      rightWidthRef.current = width;
      setRightWidth(width);
    }
    schedulePanelWidthPersistence(side, width);
  }, [schedulePanelWidthPersistence]);

  /** Restores the side-specific dock width used by a double-clicked divider. */
  const resetPanelWidth = useCallback((side: PanelSide) => {
    updatePanelWidth(
      side,
      side === "left" ? DEFAULT_LEFT_PANEL_WIDTH : DEFAULT_RIGHT_PANEL_WIDTH
    );
  }, [updatePanelWidth]);

  const updateBottomPanel = useCallback((panel: BottomPanel | null) => {
    setBottomPanel(panel);
    persistDesktopState({ bottomPanelOpen: panel !== null });
  }, [persistDesktopState]);

  const toggleBottomPanel = useCallback(() => {
    updateBottomPanel(bottomPanel ? null : "terminal");
  }, [bottomPanel, updateBottomPanel]);

  const selectLeftPanel = useCallback((target: LeftPanel) => {
    setLeftPanel((panel) => {
      const next = panel === target ? null : target;
      persistDesktopState({ explorerOpen: next === "explorer" });
      return next;
    });
  }, [persistDesktopState]);

  const handleWorkspaceOpened = useCallback((rootPath: string, snapshot: NativeWorkspaceSnapshot) => {
    setRestoredWorkspacePath(rootPath);
    setWorkspaceName(snapshot.workspace.name);
    setWorkspaceFiles(snapshot.files);
    const recentPaths = updateRecentWorkspacePaths(rootPath);
    void useSearchIndexStore.getState().indexWorkspace(rootPath, snapshot.files);
    void useWikiLinkIndexStore.getState().indexWorkspace(rootPath, snapshot.files);
    persistDesktopState({ lastWorkspacePath: rootPath, recentWorkspacePaths: recentPaths });
  }, [persistDesktopState, updateRecentWorkspacePaths]);

  const handleWorkspaceUnavailable = useCallback(() => {
    setRestoredWorkspacePath(null);
    setWorkspaceName(null);
    setWorkspaceFiles([]);
    useSearchIndexStore.getState().clearWorkspace();
    useWikiLinkIndexStore.getState().clearWorkspace();
    persistDesktopState({ lastWorkspacePath: null });
  }, [persistDesktopState]);

  const handleWorkspaceLaunched = useCallback((rootPath: string) => {
    const recentPaths = updateRecentWorkspacePaths(rootPath);
    // Persist `lastWorkspacePath` so a fresh window (or a window whose native
    // root query returns null) can restore to the most recently launched
    // workspace. In multi-window Tauri sessions, `window_workspace_root`
    // takes precedence over this fallback on reload.
    persistDesktopState({ lastWorkspacePath: rootPath, recentWorkspacePaths: recentPaths });
  }, [persistDesktopState, updateRecentWorkspacePaths]);

  const showExplorer = useCallback(() => {
    setLeftPanel("explorer");
    persistDesktopState({ explorerOpen: true });
  }, [persistDesktopState]);

  const acknowledgeNewNoteFocus = useCallback(() => {
    setNewNoteFocusRequest(0);
  }, []);

  const requestNewNoteFocus = useCallback(() => {
    setNewNoteFocusRequest((request) => request + 1);
  }, []);

  // Publishes the workspace surface extensions use. The root, the tabs, and the
  // documents are all React state here, so the bridge is republished whenever
  // the root changes and withdrawn on unmount — an extension calling into a
  // stale shell would open a tab nobody renders.
  useEffect(() => {
    setWorkspaceBridge({
      rootPath: restoredWorkspacePath,
      openNote: (relativePath) => {
        if (!restoredWorkspacePath) return;
        openMarkdownDocument(restoredWorkspacePath, relativePath);
      },
      openTab: (kind, title) => {
        dispatchTabs({ type: "open", tab: createStaticTab(kind, title) });
      }
    });
    return () => setWorkspaceBridge(null);
  }, [restoredWorkspacePath, openMarkdownDocument]);

  // Reload settings whenever the workspace root changes so the settings store
  // knows the workspace root path. Without this, workspace-scoped settings
  // (like journal fieldDefinitions) are unsaveable when the user hasn't opened
  // the Settings tab — `workspaceRootPath` stays null from ThemeProvider's
  // initial `loadSettings(null)`, and `saveSettings` silently strands every
  // workspace-scoped write in `stagedChanges` without persisting anything.
  // SettingsTab has its own guard that skips the reload if the root matches.
  useEffect(() => {
    if (!isTauri()) return;
    const { loaded, workspaceRootPath } = useSettingsStore.getState();
    if (loaded && workspaceRootPath === restoredWorkspacePath) return;
    void useSettingsStore.getState().loadSettings(restoredWorkspacePath);
  }, [restoredWorkspacePath]);

  // Subscribe the search index to note mutation events for incremental updates.
  // The store's actions are workspace-scoped, so events from other windows are ignored.
  useEffect(() => useSearchIndexStore.getState().subscribeToEvents(), []);
  // Subscribe the wiki-link index to note mutation events for incremental updates.
  // The store's actions are workspace-scoped, so events from other windows are ignored.
  useEffect(() => useWikiLinkIndexStore.getState().subscribeToEvents(), []);

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
      void useSearchIndexStore.getState().indexWorkspace(rootPath, snapshot.files);
      void useWikiLinkIndexStore.getState().indexWorkspace(rootPath, snapshot.files);
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
        void useSearchIndexStore.getState().indexWorkspace(rootPath, snapshot.files);
        void useWikiLinkIndexStore.getState().indexWorkspace(rootPath, snapshot.files);
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
  }, [restoredWorkspacePath]);

  const handleMarkdownFileCreated = useCallback((rootPath: string, relativePath: string) => {
    if (rootPath !== restoredWorkspacePath) return;
    setWorkspaceFiles((files) => addWorkspaceFile(files, relativePath));
  }, [restoredWorkspacePath]);

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
  }, [restoredWorkspacePath]);

  const cancelDeferredPersistence = useCallback(() => {
    savePanelWidth.left.cancel();
    savePanelWidth.right.cancel();
    saveTabs.cancel();
  }, [savePanelWidth, saveTabs]);

  return {
    acknowledgeNewNoteFocus,
    bottomPanel,
    cancelDeferredPersistence,
    handleMarkdownFileCreated,
    handleWorkspaceLaunched,
    handleWorkspaceOpened,
    handleWorkspaceUnavailable,
    leftPanel,
    leftWidth,
    leftWidthRef,
    newNoteFocusRequest,
    persistDesktopState,
    recentWorkspacePaths,
    resetPanelWidth,
    requestNewNoteFocus,
    restoredWorkspacePath,
    rightWidth,
    rightWidthRef,
    selectLeftPanel,
    setLeftPanel,
    showExplorer,
    stateRestored,
    toggleBottomPanel,
    updateBottomPanel,
    updatePanelWidth,
    workspaceFiles,
    workspaceName
  };
}

/** Converts a runtime tab to the serializable shape persisted in desktop state. */
function tabToPersisted(tab: DesktopTab): PersistedTab {
  return {
    id: tab.id,
    title: tab.title,
    kind: tab.kind,
    ...(tab.resource?.rootPath ? { rootPath: tab.resource.rootPath } : {}),
    ...(tab.resource?.relativePath ? { relativePath: tab.resource.relativePath } : {})
  };
}

/**
 * Reconstructs a runtime tab from persisted metadata.
 *
 * Editor tabs whose resource paths are missing are skipped: a tab with no file
 * to open would just show a blank editor. Static tabs (settings, calendar, etc.)
 * are restored by kind alone.
 */
function restoreTab(persisted: PersistedTab, fallbackRootPath: string | null): DesktopTab | null {
  if (persisted.kind === "editor") {
    const rootPath = persisted.rootPath ?? fallbackRootPath;
    const relativePath = persisted.relativePath;
    if (!rootPath || !relativePath) return null;
    return createEditorTab({ rootPath, relativePath });
  }
  // Validate the persisted static kind against the tab registry before casting.
  // A stale or corrupted persisted state with an unknown kind is skipped rather
  // than silently producing a broken tab that renders an Unavailable placeholder.
  if (desktopTabRegistry.get(persisted.kind) === undefined) return null;
  return createStaticTab(
    persisted.kind as Exclude<import("@thinkbrain/core").TabKind, "editor">,
    persisted.title
  );
}
