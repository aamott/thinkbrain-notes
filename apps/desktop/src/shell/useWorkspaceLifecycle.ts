import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { setWorkspaceBridge } from "../extensions/workspaceBridge";
import { createDebounced } from "../lib/debounce";
import type { NativeMarkdownFileEntry, NativeWorkspaceSnapshot } from "../native/commands";
import {
  DEFAULT_DESKTOP_STATE,
  loadDesktopState,
  promoteRecentWorkspace,
  workspaceTabs,
  type PersistedTab
} from "../settings/desktopState";
import {
  persistDesktopState,
  readDesktopState,
  reportDesktopStateReadFailure
} from "../settings/desktopStatePersistence";
import { useSettingsStore } from "../settings/settingsStore";
import {
  createFileTab,
  createStaticTab,
  isDocumentBackedKind,
  type DesktopTab,
  type DesktopTabAction,
  type DesktopTabState
} from "../tabs/tabModel";
import { desktopTabRegistry } from "../tabs/tabRegistry";
import { workspaceDesktopApi } from "../workspace/workspaceAdapter";
import { usePanelLayout } from "./usePanelLayout";
import { clearWorkspaceStores, indexWorkspaceStores, useWorkspaceIndexes } from "./useWorkspaceIndexes";
import { addWorkspaceFile } from "./workspaceFileList";
/** How long a burst of tab opens and closes settles before it is written down. */
const TAB_PERSIST_DELAY_MS = 400;
interface UseWorkspaceLifecycleOptions {
  readonly tabState: DesktopTabState;
  readonly dispatchTabs: Dispatch<DesktopTabAction>;
  readonly loadDocumentIntoView: (tabId: string, rootPath: string, relativePath: string, kind?: string) => void;
  readonly openMarkdownDocument: (rootPath: string, relativePath: string) => void;
  readonly openFileDocument?: (rootPath: string, relativePath: string) => void;
}
export function useWorkspaceLifecycle({
  tabState,
  dispatchTabs,
  loadDocumentIntoView,
  openMarkdownDocument,
  openFileDocument
}: UseWorkspaceLifecycleOptions) {
  // Panel layout — which docks are open, how wide they are, and their
  // debounced persistence — is its own hook; the lifecycle keeps the names
  // its callers already use.
  const {
    bottomPanel,
    cancelPanelWidthPersistence,
    leftPanel,
    leftWidth,
    leftWidthRef,
    resetPanelWidth,
    restorePanels,
    rightWidth,
    rightWidthRef,
    selectLeftPanel,
    setLeftPanel,
    showExplorer,
    toggleBottomPanel,
    updateBottomPanel,
    updatePanelWidth
  } = usePanelLayout();
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
    void Promise.allSettled([readDesktopState(), workspaceDesktopApi.windowWorkspaceRoot()]).then(([desktopResult, rootResult]) => {
      if (!active) return;
      // `readDesktopState` reports and falls back to defaults on failure, so
      // the desktop result is always fulfilled — the ternary is kept for the
      // `allSettled` type narrowing `windowWorkspaceRoot` requires.
      const desktopState = desktopResult.status === "fulfilled" ? desktopResult.value : DEFAULT_DESKTOP_STATE;
      const windowRoot = rootResult.status === "fulfilled" ? rootResult.value : null;
      const recentPaths = windowRoot
        ? promoteRecentWorkspace(desktopState.recentWorkspacePaths, windowRoot)
        : desktopState.recentWorkspacePaths;
      setRestoredWorkspacePath(windowRoot ?? desktopState.lastWorkspacePath);
      recentWorkspacePathsRef.current = recentPaths;
      setRecentWorkspacePaths(recentPaths);
      restorePanels(desktopState);

      // Restore this workspace's tabs once. Guarded by a ref because StrictMode
      // double-mounts effects in dev — without this, tabs would open twice.
      //
      // Keyed by the workspace this window actually has open. Reading a single
      // shared list here is what used to give two windows on two vaults the
      // same tabs, each pointing at the other's notes.
      const rootPath = windowRoot ?? desktopState.lastWorkspacePath;
      const restoring = workspaceTabs(desktopState, rootPath);
      if (!tabsRestoredRef.current && restoring.openTabs.length > 0) {
        tabsRestoredRef.current = true;
        for (const persisted of restoring.openTabs) {
          const tab = restoreTab(persisted, rootPath);
          if (tab) {
            dispatchTabs({ type: "open", tab });
            // Every document-backed kind needs its file re-read, not just
            // Markdown editors — a restored code-editor tab never leaves
            // "Loading" otherwise. The kind rides along so the loader picks
            // the text-file API for code files rather than the Markdown one.
            if (isDocumentBackedKind(tab.kind) && tab.resource?.rootPath && tab.resource?.relativePath) {
              loadDocumentIntoView(tab.id, tab.resource.rootPath, tab.resource.relativePath, tab.kind);
            }
          }
        }
        if (restoring.activeTabId) {
          dispatchTabs({ type: "activate", tabId: restoring.activeTabId });
        }
      }
    }).finally(() => {
      if (active) setStateRestored(true);
    });

    return () => {
      active = false;
    };
  }, [dispatchTabs, loadDocumentIntoView, restorePanels]);

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
      }).catch(reportDesktopStateReadFailure);
    };

    window.addEventListener("focus", refreshRecentWorkspacePaths);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshRecentWorkspacePaths);
    };
  }, []);

  /**
   * Debounced tab persistence: writes the open tab list and active tab id
   * whenever tabs change, coalescing rapid open/close bursts into one write.
   * Skipped until state restoration completes so restored tabs don't
   * immediately trigger a redundant save.
   */
  const saveTabs = useMemo(
    () =>
      createDebounced<TabSave>(({ tabs, workspacePath }) => {
        // New-tab pages are ephemeral — a restart opens files, not blanks.
        const persistedTabs = tabs.tabs.filter((tab) => tab.kind !== "new-tab");
        const openTabs = persistedTabs.map(tabToPersisted);
        const activeTabId = persistedTabs.some((tab) => tab.id === tabs.activeTabId)
          ? tabs.activeTabId
          : null;
        persistDesktopState({
          // Targeted: this window says what *its* workspace has open and
          // touches no other, which is what keeps two windows from overwriting
          // each other. The flat pair below is the same list under the old
          // field, kept written so an older build still finds something.
          ...(workspacePath
            ? { workspaceTabs: { workspacePath, openTabs, activeTabId } }
            : {}),
          openTabs,
          activeTabId
        });
      }, TAB_PERSIST_DELAY_MS),
    []
  );
  useEffect(() => {
    if (!stateRestored || !isTauri()) return;
    saveTabs({ tabs: tabState, workspacePath: restoredWorkspacePath });
  }, [saveTabs, stateRestored, tabState, restoredWorkspacePath]);

  const handleWorkspaceOpened = useCallback((rootPath: string, snapshot: NativeWorkspaceSnapshot) => {
    setRestoredWorkspacePath(rootPath);
    setWorkspaceName(snapshot.workspace.name);
    setWorkspaceFiles(snapshot.files);
    const recentPaths = updateRecentWorkspacePaths(rootPath);
    indexWorkspaceStores(rootPath, snapshot.files);
    persistDesktopState({ lastWorkspacePath: rootPath, recentWorkspacePaths: recentPaths });
  }, [updateRecentWorkspacePaths]);

  const handleWorkspaceUnavailable = useCallback(() => {
    setRestoredWorkspacePath(null);
    setWorkspaceName(null);
    setWorkspaceFiles([]);
    clearWorkspaceStores();
    persistDesktopState({ lastWorkspacePath: null });
  }, []);

  const handleWorkspaceLaunched = useCallback((rootPath: string) => {
    const recentPaths = updateRecentWorkspacePaths(rootPath);
    // Persist `lastWorkspacePath` so a fresh window (or a window whose native
    // root query returns null) can restore to the most recently launched
    // workspace. In multi-window Tauri sessions, `window_workspace_root`
    // takes precedence over this fallback on reload.
    persistDesktopState({ lastWorkspacePath: rootPath, recentWorkspacePaths: recentPaths });
  }, [updateRecentWorkspacePaths]);

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
      openFile: openFileDocument
        ? (relativePath) => {
            if (!restoredWorkspacePath) return;
            openFileDocument(restoredWorkspacePath, relativePath);
          }
        : undefined,
      openTab: (kind, title) => {
        dispatchTabs({ type: "open", tab: createStaticTab(kind, title) });
      }
    });
    return () => setWorkspaceBridge(null);
  }, [restoredWorkspacePath, openMarkdownDocument, openFileDocument, dispatchTabs]);

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

  // Called after the bridge and settings effects so the index, watcher and
  // file-list subscriptions inside it run in the order they had before the
  // split.
  useWorkspaceIndexes({ restoredWorkspacePath, setWorkspaceFiles });

  const handleMarkdownFileCreated = useCallback((rootPath: string, relativePath: string) => {
    if (rootPath !== restoredWorkspacePath) return;
    setWorkspaceFiles((files) => addWorkspaceFile(files, relativePath));
  }, [restoredWorkspacePath]);

  const cancelDeferredPersistence = useCallback(() => {
    cancelPanelWidthPersistence();
    saveTabs.cancel();
  }, [cancelPanelWidthPersistence, saveTabs]);

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

/** What the debounced tab save needs: the tabs, and whose they are. */
interface TabSave {
  readonly tabs: DesktopTabState;
  readonly workspacePath: string | null;
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
  if (persisted.kind === "editor" || persisted.kind === "code-editor" ||
      persisted.kind === "image-viewer" || persisted.kind === "audio-viewer" ||
      persisted.kind === "video-viewer") {
    const rootPath = persisted.rootPath ?? fallbackRootPath;
    const relativePath = persisted.relativePath;
    if (!rootPath || !relativePath) return null;
    return createFileTab({ rootPath, relativePath });
  }
  // Validate the persisted static kind against the tab registry before casting.
  if (desktopTabRegistry.get(persisted.kind) === undefined) return null;
  return createStaticTab(
    persisted.kind as Exclude<import("@thinkbrain/core").TabKind, "editor">,
    persisted.title
  );
}
